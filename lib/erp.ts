// Server data boundary: only unprocessed raw cells enter this module.
import {
  numeric,
  date,
  days,
  type Rows,
  type Raw,
  type Aggregate,
  type Snapshot,
  type Risk,
} from "./model";
import { SCOPES, sheetNames } from "./config";
export const ERP_POLICY_VERSION = "company-policy-v1";
export function normalizeERP(sales: number, profit: number) {
  return { sales: sales * 0.9, profit: profit * 0.85 };
}
const blank = () => ({ sales: 0, profit: 0, count: 0 });
function field(rows: Rows, aliases: string[]) {
  for (let r = 0; r < 10 && r < rows.length; r++) {
    const c = rows[r].findIndex((v) =>
      aliases.includes(String(v ?? "").trim()),
    );
    if (c >= 0) return { r, c };
  }
  throw Error(`缺少表头 ${aliases}`);
}
function group(v: unknown) {
  return SCOPES.slice(1).find((g) => g === String(v ?? "").trim()) ?? "未归属";
}
function add(a: Aggregate, g: string, d: string, s: number, p: number) {
  a[g] ??= {};
  a[g][d] ??= blank();
  a[g][d].sales += s;
  a[g][d].profit += p;
  a[g][d].count++;
}
export function aggregateHistory(raw: Raw) {
  const history: Aggregate = {};
  const risks: Risk[] = [];
  for (const name of [sheetNames.country, sheetNames.parent]) {
    const rows = raw[name],
      dh = field(rows, ["日期"]),
      sh = field(rows, ["销售额"]),
      gh = name === sheetNames.parent ? field(rows, ["组别"]) : null;
    let invalid = 0;
    for (const row of rows.slice(dh.r + 1)) {
      if (!row.some((v) => v !== null && v !== "")) continue;
      const d = date(row[dh.c]),
        s = numeric(row[sh.c]);
      if (!d || s === null) {
        invalid++;
        continue;
      }
      if (d < "2025-10-01" || d > "2025-12-31") continue;
      const amount = normalizeERP(s, 0).sales;
      add(history, gh ? group(row[gh.c]) : "公司", d, amount, 0);
      if (gh) add(history, "父单公司", d, amount, 0);
    }
    if (invalid)
      risks.push({
        scope: "公司",
        severity: "中",
        issue: `${name}历史异常记录`,
        evidence: `${invalid}条日期或金额不可用，未计入历史曲线`,
        action: "核查源数据后重建历史缓存",
      });
  }
  for (const g of SCOPES) {
    const missing = days("2025-10-01", "2025-12-31").filter(
      (d) => !history[g]?.[d],
    );
    if (missing.length)
      risks.push({
        scope: g,
        severity: "中",
        issue: "历史缓存日期缺失",
        evidence: `${missing.length}天无记录；不补造日销售`,
        action: "核验历史数据并明确重建",
      });
  }
  return { history, risks };
}
export function aggregateDetails(raw: Raw, cutoff: string) {
  const owners: Snapshot["owners"] = {},
    daily: Aggregate = {},
    risks: Risk[] = [];
  const ensure = (g: string, n: string) =>
    (owners[`${g} / ${n}`] ??= { group: g, october: blank(), daily: {} });
  const rows = raw[sheetNames.october],
    gh = field(rows, ["分组"]),
    sh = field(rows, ["销售额（人民币）", "销售额"]),
    ph = field(rows, ["净利润（人民币）", "净利润"]),
    oh = field(rows, ["运营负责人"]);
  for (const row of rows.slice(Math.max(gh.r, sh.r, ph.r, oh.r) + 1)) {
    const s = numeric(row[sh.c]),
      p = numeric(row[ph.c]);
    if (s === null || p === null) continue;
    const o = ensure(
      group(row[gh.c]),
      String(row[oh.c] || "未归属负责人"),
    ).october;
    o.sales += s;
    o.profit += p;
    o.count++;
  }
  for (const key of [
    sheetNames.erp,
    ...(raw.ERP_DECEMBER ? ["ERP_DECEMBER"] : []),
  ]) {
    const erp = raw[key],
      dh = field(erp, ["日期"]),
      sh = field(erp, ["销售额"]),
      ph = field(erp, ["销售净毛利"]),
      gh = field(erp, ["组别"]),
      oh = field(erp, ["运营负责人"]);
    const seen = new Set();
    let duplicate = 0,
      invalid = 0;
    for (const row of erp.slice(dh.r + 1)) {
      if (!row.some((v) => v !== null && v !== "")) continue;
      const d = date(row[dh.c]),
        s = numeric(row[sh.c]),
        p = numeric(row[ph.c]);
      if (!d || s === null || p === null) {
        invalid++;
        continue;
      }
      if (d < "2026-11-01" || d > cutoff) continue;
      if (key === "ERP_DECEMBER" && !d.startsWith("2026-12"))
        throw Error("12月ERP包含非12月日期");
      const signature = JSON.stringify(row);
      if (seen.has(signature)) duplicate++;
      seen.add(signature);
      const v = normalizeERP(s, p),
        g = group(row[gh.c]);
      add(daily, g, d, v.sales, v.profit);
      add(daily, "公司", d, v.sales, v.profit);
      const o = ensure(g, String(row[oh.c] || "未归属负责人"));
      o.daily[d] ??= blank();
      o.daily[d].sales += v.sales;
      o.daily[d].profit += v.profit;
      o.daily[d].count++;
    }
    if (duplicate || invalid)
      risks.push({
        scope: "公司",
        severity: "中",
        issue: `${key}明细待核验`,
        evidence: `${duplicate}条完全重复候选；${invalid}条非法记录。保留重复候选原记录，异常仅影响明细分析。`,
        action: "核查源记录，不影响目标表权威指标",
      });
  }
  return { owners, daily, risks };
}
