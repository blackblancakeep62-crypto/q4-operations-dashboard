import { parseRankings, type PersonnelRankings } from "./rankings";
import {
  SCOPES,
  TIERS,
  thresholds,
  sheetNames,
  type Scope,
  type Tier,
} from "./config";
export type Cell = string | number | null;
export type Rows = Cell[][];
export type Raw = Record<string, Rows>;
export type Risk = {
  severity: "高" | "中" | "提示";
  scope: string;
  issue: string;
  amount?: number;
  evidence: string;
  action: string;
};
export type Target = {
  sales: number;
  standardProgress: number;
  margin: number;
  tiers: Record<Tier, { sales: number; margin: number; months: number[] }>;
  october: number;
  november: number;
  december: number | null;
  historical: number;
  profit: number;
};
export type Daily = { sales: number; profit: number; count: number };
export type Aggregate = Record<string, Record<string, Daily>>;
export type ActualPoint = {
  sales: number;
  margin: number | null;
  historical: number;
  capturedAt: string;
  source: "target" | "financial-anchor" | "erp-backfill";
  pending?: boolean;
};
export type BackfillReport = {
  createdAt: string;
  scopes: Record<
    string,
    {
      cutoff: string;
      delta: number | null;
      tolerance: number;
      missing: string[];
      duplicates: number;
      invalid: number;
      pending: boolean;
      inserted: number;
    }
  >;
};
export type ActualHistory = Record<string, Record<string, ActualPoint>>;
export type Snapshot = {
  rankings?: PersonnelRankings;
  backfill?: BackfillReport;
  version: 2;
  actualHistory: ActualHistory;
  fetchedAt: string;
  cutoff: string;
  targets: Record<Scope, Target>;
  history: Aggregate;
  daily: Aggregate;
  october: Record<string, Daily>;
  owners: Record<
    string,
    { group: string; october: Daily; daily: Record<string, Daily> }
  >;
  risks: Risk[];
  blocked: string[];
  unmatched: { sales: number; share: number };
  source: string;
  stale?: boolean;
  error?: string;
};
// Only fields consumed by the public dashboard; no raw ERP or owner detail.
export type DashboardData = Pick<Snapshot,
  "rankings" | "backfill" | "version" | "fetchedAt" | "cutoff" | "targets" |
  "risks" | "blocked" | "unmatched" | "source" | "stale" | "error"
> & {
  history: Record<string, Record<string, Pick<Daily, "sales">>>;
  actualHistory: Record<string, Record<string, Pick<ActualPoint, "sales" | "margin" | "source" | "pending">>>;
};
export const numeric = (v: Cell | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = v.trim().replace(/[,，￥¥人民币\s]/g, "");
  const negative = s.startsWith("(") && s.endsWith(")");
  if (negative) s = s.slice(1, -1);
  const n = Number(s.replace("%", ""));
  return Number.isFinite(n)
    ? n * (s.endsWith("%") ? 0.01 : 1) * (negative ? -1 : 1)
    : null;
};
export function date(v: Cell | undefined): string | null {
  if (typeof v === "number")
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000)
      .toISOString()
      .slice(0, 10);
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (!m) return null;
  const s = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return Number.isNaN(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
    ? null
    : s;
}
export function days(start: string, end: string) {
  const out: string[] = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
const empty = (): Daily => ({ sales: 0, profit: 0, count: 0 });
const group = (v: Cell | undefined) =>
  SCOPES.slice(1).find((x) => x === String(v ?? "").trim()) ?? "未归属";
function add(a: Daily, s: number, p: number) {
  a.sales += s;
  a.profit += p;
  a.count++;
}
function addDay(a: Aggregate, g: string, d: string, s: number, p: number) {
  a[g] ??= {};
  a[g][d] ??= empty();
  add(a[g][d], s, p);
}
function findHeader(rows: Rows, aliases: string[]) {
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const c = rows[r].findIndex((v) =>
      aliases.includes(String(v ?? "").trim()),
    );
    if (c >= 0) return { r, c };
  }
  throw Error(`缺少表头：${aliases.join("/")}`);
}
export const differs = (a: number, b: number) =>
  Math.abs(a - b) >
  Math.max(thresholds.moneyAbsolute, Math.abs(b) * thresholds.moneyRelative);
export function buildSnapshot(
  raw: Raw,
  fetchedAt: string,
  source: string,
  cachedHistory: Aggregate = {},
  actualHistory: ActualHistory = {},
  previousTargets?: Record<Scope, Target>,
): Snapshot {
  const risks: Risk[] = [];
  const blocked = new Set<string>();
  const warn = (
    scope: string,
    issue: string,
    evidence: string,
    amount?: number,
    severity: Risk["severity"] = "中",
  ) =>
    risks.push({
      scope,
      issue,
      evidence,
      amount,
      severity,
      action: "核查来源范围、结算时点与归属映射；确认后刷新，不缩放原始数据。",
    });
  const rows = raw[sheetNames.target];
  if (!rows) throw Error("缺少经营目标表");
  const header = rows.findIndex(
    (r) =>
      r[0] === "合计" && r.includes("准目标") && r.includes("目前完成情况"),
  );
  if (header < 0) throw Error("经营目标表结构变更：未发现已验证表头");
  const h = rows[header];
  const ci = (s: string) => {
    const i = h.indexOf(s);
    if (i < 0) throw Error(`目标表缺列 ${s}`);
    return i;
  };
  const current = ci("目前完成情况"),
    oct = ci("完成情况（财务）"),
    nov = ci("每日完成（杰航）");
  const parsedCutoff = date(rows[10]?.[19]);
  if (
    !parsedCutoff ||
    parsedCutoff < "2026-10-31" ||
    parsedCutoff > "2026-12-31"
  )
    throw Error("T11 不是有效的 Q4 已确认完整业务日期");
  const cutoff: string = parsedCutoff;
  const required = (v: Cell | undefined, label: string) => {
    const n = numeric(v);
    if (n === null) throw Error(`目标数据缺失或非法：${label}`);
    return n;
  };
  const targets = {} as Record<Scope, Target>;
  for (const scope of SCOPES) {
    try {
      const label = scope === "公司" ? "合计" : scope;
      const sale = rows
        .slice(header + 1)
        .find((r) => r[0] === label && r[1] === "总销售额");
      const margin = rows
        .slice(header + 1)
        .find((r) => r[0] === label && r[1] === "总利润率");
      if (!sale || !margin) throw Error(`${scope}目标行缺失`);
      const tiers = {} as Target["tiers"];
      for (const t of TIERS) {
        const c = ci(t);
        const months = [c + 3, c + 6, c + 9].map((i) =>
          required(sale[i], `${scope}${t}月度`),
        );
        tiers[t] = {
          sales: required(sale[c], `${scope}${t}`),
          margin: required(margin[c], `${scope}${t}利润率`),
          months,
        };
        if (tiers[t].sales <= 0) throw Error("销售目标必须大于0");
        if (
          differs(
            months.reduce((a, b) => a + b, 0),
            tiers[t].sales,
          )
        )
          warn(
            scope,
            `${t}月度目标与季度不一致`,
            "目标表月度之和 − 季度目标",
            months.reduce((a, b) => a + b, 0) - tiers[t].sales,
          );
      }
      const sales = required(sale[current], `${scope}累计`),
        rate = required(margin[current], `${scope}利润率`);
      targets[scope] = {
        sales,
        standardProgress: required(sale[18], `${scope}S列完成率`),
        margin: rate,
        profit: sales * rate,
        tiers,
        october: required(sale[oct], "10月"),
        november: required(sale[nov], "11月"),
        december: numeric(sale[nov + 1]),
        historical: required(sale[19], "T列历史进度"),
      };
    } catch (error) {
      if (!previousTargets?.[scope]) throw error;
      targets[scope] = previousTargets[scope];
      blocked.add(scope);
      warn(
        scope,
        "该组目标字段不可用，保留上次指标",
        error instanceof Error ? error.message : "读取异常",
      );
    }
  }
  const history = cachedHistory;
  for (const scope of SCOPES) {
    const hist = history[scope] ?? {},
      all = Object.values(hist).reduce((a, v) => a + v.sales, 0);
    const current = Object.entries(hist)
      .filter(([d]) => d <= cutoff.replace("2026", "2025"))
      .reduce((a, [, v]) => a + v.sales, 0);
    if (all <= 0)
      warn(scope, "历史缓存不可用", "实际曲线与经营指标仍以目标表为准");
    else if (
      Math.abs(current / all - targets[scope].historical) >
      thresholds.historicalProgress
    )
      warn(
        scope,
        "历史缓存与T列进度不一致",
        `缓存 ${((current / all) * 100).toFixed(3)}%；T列 ${(targets[scope].historical * 100).toFixed(3)}%；当前点采用T列`,
      );
  }
  const total = SCOPES.slice(1).reduce((a, g) => a + targets[g].sales, 0);
  if (differs(total, targets["公司"].sales))
    warn(
      "公司",
      "四组与公司目标表累计不一致",
      "四组O列之和 − 公司O列",
      total - targets["公司"].sales,
    );
  const parentTotal = Object.values(history["父单公司"] ?? {}).reduce(
    (a, d) => a + d.sales,
    0,
  );
  const unmatched = Object.values(history["未归属"] ?? {}).reduce(
    (a, d) => a + d.sales,
    0,
  );
  const countryTotal = Object.values(history["公司"] ?? {}).reduce(
    (a, d) => a + d.sales,
    0,
  );
  if (Math.abs(parentTotal - countryTotal) > 0.01)
    warn(
      "公司",
      "2025国家表与父单表对账差额",
      "父单汇总 − 国家汇总；公司使用国家表",
      parentTotal - countryTotal,
      differs(parentTotal, countryTotal) ? "中" : "提示",
    );
  if (unmatched !== 0)
    warn("未归属", "2025存在未归属销售", "单独保留，不分配运营组", unmatched);
  const age =
    (Date.parse(fetchedAt.slice(0, 10)) - Date.parse(cutoff)) / 86400000;
  if (age > thresholds.staleDays)
    warn("公司", "业务数据日期滞后", `T11距读取日期 ${age} 天`);
  return {
    version: 2,
    rankings: parseRankings(rows),
    fetchedAt,
    source,
    cutoff,
    targets,
    history,
    actualHistory,
    daily: {},
    october: {},
    owners: {},
    risks,
    blocked: [...blocked],
    unmatched: {
      sales: unmatched,
      share: parentTotal ? unmatched / parentTotal : 0,
    },
  };
}
export function curve(s: DashboardData, scope: Scope, tier: Tier) {
  const t = s.targets[scope].tiers[tier];
  const hist = s.history[scope] ?? {};
  const total = Object.values(hist).reduce((a, b) => a + b.sales, 0);
  let hc = 0,
    pc = 0;
  let valid = true;
  const monthSums = [10, 11, 12].map((m) =>
    Object.entries(hist)
      .filter(([d]) => Number(d.slice(5, 7)) === m)
      .reduce((a, [, v]) => a + v.sales, 0),
  );
  return days("2026-10-01", "2026-12-31").map((d) => {
    const h = hist[d.replace("2026", "2025")];
    hc += h?.sales ?? 0;
    const mi = Number(d.slice(5, 7)) - 10;
    const complete = days(
      `2025-${d.slice(5, 7)}-01`,
      `2025-${d.slice(5, 7)}-${mi === 1 ? "30" : "31"}`,
    ).every((x) => hist[x]);
    if (complete && monthSums[mi] > 0)
      pc += (t.months[mi] * (h?.sales ?? 0)) / monthSums[mi];
    else valid = false;
    const actual =
      d === "2026-10-31"
        ? s.targets[scope].october
        : d <= s.cutoff
          ? (s.actualHistory[scope]?.[d]?.sales ?? null)
          : null;
    const historical =
      d === s.cutoff ? s.targets[scope].historical : total ? hc / total : null;
    const point = s.actualHistory[scope]?.[d];
    const previous =
      s.actualHistory[scope]?.[
        new Date(Date.parse(d) - 86400000).toISOString().slice(0, 10)
      ];
    const boundary =
      point?.source === "target" &&
      previous?.source === "erp-backfill" &&
      previous.pending;
    return {
      date: d.slice(5),
      fullDate: d,
      actualSource:
        d === "2026-10-31"
          ? "财务锚点"
          : point?.source === "erp-backfill"
            ? "ERP历史回填"
            : "目标表每日快照",
      pending: point?.pending ?? false,
      actualLine: actual === null || point?.pending ? null : actual / t.sales,
      actualBackfill:
        actual !== null &&
        (point?.pending ||
          (d === "2026-10-31" && s.backfill?.scopes[scope]?.pending))
          ? actual / t.sales
          : null,
      actualEndpoint:
        actual !== null && (d === s.cutoff || boundary)
          ? actual / t.sales
          : null,
      history: historical,
      actual: actual === null ? null : actual / t.sales,
      plan: valid ? pc / t.sales : null,
      amount: actual,
      targetAmount: historical !== null ? t.sales * historical : null,
      gap:
        actual !== null && historical !== null
          ? actual / t.sales - historical
          : null,
    };
  });
}
export function curveMaximum(points: ReturnType<typeof curve>) {
  const max = Math.max(
    1,
    ...points.flatMap((p) => [p.actual ?? 0, p.history ?? 0, p.plan ?? 0]),
  );
  return max <= 1 + 1e-8 ? 1 : Math.ceil(max * 10) / 10;
}
export function metrics(s: DashboardData, scope: Scope, tier: Tier) {
  const t = s.targets[scope],
    goal = t.tiers[tier],
    progress = tier === "准目标" ? t.standardProgress : t.sales / goal.sales,
    remaining = Math.max(0, goal.sales - t.sales),
    remainingDays = Math.max(
      0,
      Math.round((Date.parse("2026-12-31") - Date.parse(s.cutoff)) / 86400000),
    );
  return {
    goal: goal.sales,
    progress,
    gap: progress - t.historical,
    moneyGap: t.sales - goal.sales * t.historical,
    remaining,
    remainingDays,
    dailyRequired: remainingDays ? remaining / remainingDays : null,
    marginGap: t.margin - goal.margin,
  };
}
export function recent(s: DashboardData, scope: Scope, tier: Tier) {
  const ds = days(
    new Date(Date.parse(s.cutoff) - 7 * 86400000).toISOString().slice(0, 10),
    s.cutoff,
  );
  const saved = s.actualHistory[scope] ?? {};
  if (ds.some((d) => !saved[d] || saved[d].pending)) return null;
  const sales = saved[s.cutoff].sales - saved[ds[0]].sales;
  const points = curve(s, scope, tier);
  const first = points.find((p) => p.date === ds[0].slice(5)),
    last = points.find((p) => p.date === s.cutoff.slice(5));
  return {
    sales,
    margin: saved[s.cutoff].margin,
    improvement:
      first?.gap != null && last?.gap != null ? last.gap - first.gap : null,
  };
}
export function businessRisks(s: DashboardData, tier: Tier): Risk[] {
  return SCOPES.flatMap((scope) => {
    const t = s.targets[scope],
      m = metrics(s, scope, tier),
      r: Risk[] = [];
    const add = (
      issue: string,
      evidence: string,
      severity: Risk["severity"],
      amount?: number,
    ) =>
      r.push({
        scope,
        issue,
        evidence,
        severity,
        amount,
        action: "核查销量、售价、退货、费用与结算口径，结合产品明细定位原因。",
      });
    if (t.margin < t.tiers["生存目标"].margin)
      add("利润率低于生存目标", `当前 ${(t.margin * 100).toFixed(2)}%`, "高");
    else if (t.margin < t.tiers["准目标"].margin)
      add("利润率低于准目标", `当前 ${(t.margin * 100).toFixed(2)}%`, "中");
    else if (m.marginGap < 0)
      add(
        `利润率低于${tier}`,
        `差距 ${(m.marginGap * 100).toFixed(2)} pp`,
        "提示",
      );
    if (!s.blocked.includes(scope)) {
      const plan = curve(s, scope, tier).find(
        (p) => p.date === s.cutoff.slice(5),
      )?.plan;
      const rr = recent(s, scope, tier);
      if (m.gap < 0)
        add(
          "销售进度落后历史节奏",
          `差距 ${(m.gap * 100).toFixed(2)} pp；近7天 ${rr?.improvement != null ? (rr.improvement * 100).toFixed(2) + " pp" : "数据不足"}`,
          "中",
          m.moneyGap,
        );
      if (plan != null && m.progress < plan)
        add(
          "销售进度落后月度计划",
          `差距 ${((m.progress - plan) * 100).toFixed(2)} pp`,
          "中",
          t.sales - plan * m.goal,
        );
    }
    return r;
  });
}
