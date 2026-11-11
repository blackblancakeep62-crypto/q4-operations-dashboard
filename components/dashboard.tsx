"use client";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  ShieldCheck,
  ChartNoAxesCombined,
  Target,
  TriangleAlert,
  ChevronRight,
  Layers,
  Clock3,
} from "lucide-react";
import { SCOPES, TIERS, thresholds, type Scope, type Tier } from "@/lib/config";
import {
  curve,
  curveMaximum,
  metrics,
  recent,
  businessRisks,
  type DashboardData,
  type Risk,
} from "@/lib/model";
const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(
        n / 10000,
      ) + " 万";
const pct = (n: number | null | undefined) =>
  n == null ? "—" : (n * 100).toFixed(2) + "%";
const pp = (n: number | null | undefined) =>
  n == null ? "数据不足" : (n >= 0 ? "+" : "") + (n * 100).toFixed(2) + " pp";
const time = (s: string) =>
  new Date(s).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
function Delta({ n }: { n: number }) {
  return (
    <span className={n >= 0 ? "positive" : "negative"}>
      {n >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{" "}
      {pp(n)}
    </span>
  );
}
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("经营总览"),
    [scope, setScope] = useState<Scope>("公司"),
    [tier, setTier] = useState<Tier>("准目标"),
    [riskLevel, setRiskLevel] = useState("全部");
  async function load(refresh = false) {
    setLoading(true);
    setError("");
    try {
      const isStatic = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
      const r = await fetch(isStatic ? `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/dashboard.json?t=${Date.now()}` : "/api/dashboard", {
        method: !isStatic && refresh ? "POST" : "GET",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok) throw Error(json.error || `请求失败 ${r.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "数据不可用");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  const m = data ? metrics(data, scope, tier) : null,
    t = data?.targets[scope],
    points = data ? curve(data, scope, tier) : [],
    allRisks = data
      ? [...data.risks, ...businessRisks(data, tier)].sort(
          (a, b) =>
            ["高", "中", "提示"].indexOf(a.severity) -
            ["高", "中", "提示"].indexOf(b.severity),
        )
      : [];
  const risks = allRisks.filter(
    (r) =>
      (scope === "公司" || r.scope === scope || r.scope === "公司") &&
      (riskLevel === "全部" || r.severity === riskLevel),
  );
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <ChartNoAxesCombined size={23} />
          <b>经营驾驶舱</b>
        </div>
        <div className="workspace">BUSINESS WORKSPACE</div>
        <div className="season">
          <span className="season-icon">Q4</span>
          <div>
            <b>2026 旺季大作战</b>
            <small>10.01 — 12.31</small>
          </div>
        </div>
        <nav>
          {["经营总览", "优秀表现", "风险预警"].map((x, i) => (
            <button
              className={tab === x ? "active" : ""}
              key={x}
              onClick={() => setTab(x)}
            >
              {i === 0 ? (
                <Layers size={18} />
              ) : i === 1 ? (
                <ChartNoAxesCombined size={18} />
              ) : (
                <TriangleAlert size={18} />
              )}{" "}
              {x}
              {i === 2 && data && <em>{allRisks.length}</em>}
            </button>
          ))}
        </nav>
        <div className="side-note">
          <ShieldCheck size={19} />
          <b>内部数据 · 只读连接</b>
          <p>
            以权威目标为准
            <br />
            用历史节奏识别偏差
          </p>
          <span className="dot" /> Google Sheets
        </div>
      </aside>
      <main>
        <div className="topline">
          <span>
            经营管理 <ChevronRight size={13} /> Q4目标看板
          </span>
          <span>
            <ShieldCheck size={14} /> {process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ? "团队共享" : "内部访问"}
          </span>
        </div>
        <header>
          <div>
            <div className="eyebrow">QUARTERLY OPERATIONS / 2026</div>
            <h1>Q4 旺季经营总控台</h1>
            <p>
              2026年第四季度 <span>·</span> 数据截至 {data?.cutoff ?? "待连接"}{" "}
              <span>·</span> 最近成功同步 {data ? time(data.fetchedAt) : "—"}
            </p>
          </div>
          <button
            className="refresh"
            onClick={() => load(true)}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            {loading ? "读取中…" : process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ? "读取最新快照" : "刷新数据"}
          </button>
        </header>
        {tab !== "优秀表现" && (
          <div className="filters">
            <div>
              <span className="filter-label">经营范围</span>
              <div className="segmented">
                {SCOPES.map((x) => (
                  <button
                    key={x}
                    className={scope === x ? "selected" : ""}
                    onClick={() => setScope(x)}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="tier">目标档位</label>
              <select
                id="tier"
                value={tier}
                onChange={(e) => setTier(e.target.value as Tier)}
              >
                {TIERS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        {error && (
          <div className="notice danger">
            <TriangleAlert size={18} />
            <div>
              <b>数据读取失败</b>
              <p>{error}</p>
              {data && <p>当前保留 {time(data.fetchedAt)} 快照。</p>}
            </div>
          </div>
        )}
        {data?.stale && (
          <div className="notice">
            <Clock3 size={18} />
            <div>
              <b>当前为历史快照 · 自动更新尚未成功</b>
              <p>
                {data.error} 快照时间：{time(data.fetchedAt)}
              </p>
            </div>
          </div>
        )}
        {!data ? (
          <section className="empty panel">
            <ChartNoAxesCombined size={42} />
            <h2>{loading ? "正在读取经营数据" : "尚无可用经营数据"}</h2>
            <p>
              {loading
                ? "首次加载会完成聚合、日期校验和来源对账。"
                : "请按 README 配置服务端 Google Sheets 只读授权，然后刷新。"}
            </p>
          </section>
        ) : (
          <>
            <div className="section-heading">
              <h2>{tab}</h2>
              {tab !== "优秀表现" && (
                <span>
                  {scope} / {tier} <span className="tag">CNY · 人民币</span>
                </span>
              )}
            </div>
            {tab === "经营总览" && m && t && (
              <>
                <section className="kpis">
                  {[
                    [
                      "Q4 销售额目标",
                      money(m.goal),
                      "目标来源：01_经营目标",
                      null,
                    ],
                    [
                      "Q4 累计销售额",
                      money(t.sales),
                      "目标表权威累计 · O列",
                      null,
                    ],
                    [
                      "Q4 目标完成率",
                      pct(m.progress),
                      `所选档位：${tier}`,
                      null,
                    ],
                    [
                      "去年同期进度差距",
                      pp(m.gap),
                      `对应金额 ${money(m.moneyGap)}`,
                      m.gap,
                    ],
                    [
                      "Q4 累计利润率",
                      pct(t.margin),
                      `目标 ${pct(t.tiers[tier].margin)} · 差距 ${pp(m.marginGap)}`,
                      m.marginGap,
                    ],
                    [
                      "剩余销售目标",
                      money(m.remaining),
                      `剩余 ${m.remainingDays} 天 · 日均 ${money(m.dailyRequired)}`,
                      null,
                    ],
                  ].map(([label, value, note, delta]) => (
                    <article className="panel kpi" key={String(label)}>
                      <div>
                        {label}
                        <Target size={14} />
                      </div>
                      <strong
                        className={
                          typeof delta === "number"
                            ? delta < 0
                              ? "negative"
                              : "positive"
                            : ""
                        }
                      >
                        {value}
                      </strong>
                      <small>{note}</small>
                    </article>
                  ))}
                </section>
                <section className="panel chart-panel">
                  <div className="panel-title">
                    <div>
                      <h2>历史节奏对照</h2>
                      <p>观察目标完成节奏，识别领先与落后</p>
                    </div>
                    <span className="tag">2026 Q4 / {scope}</span>
                  </div>
                  <div className="chart-summary">
                    <div>
                      <small>2026 当前完成率</small>
                      <b>{pct(m.progress)}</b>
                    </div>
                    <div>
                      <small>2025 同期进度 · T列</small>
                      <b>{pct(t.historical)}</b>
                    </div>
                    <div>
                      <small>同期进度差距</small>
                      <b>
                        <Delta n={m.gap} />
                      </b>
                    </div>
                    <div>
                      <small>对应销售额差距</small>
                      <b className={m.moneyGap < 0 ? "negative" : "positive"}>
                        {money(m.moneyGap)}
                      </b>
                    </div>
                  </div>
                  {data.blocked.includes(scope) && (
                    <div className="inline-alert">
                      <TriangleAlert size={15} />{" "}
                      数据待核验：已暂停该范围实际曲线及依赖该曲线的排名、销售预警。目标卡片保留目标表权威值。
                      <button onClick={() => setTab("风险预警")}>
                        查看差异 →
                      </button>
                    </div>
                  )}
                  {data.backfill?.scopes[scope] && (
                    <div className="inline-alert">
                      {data.backfill.scopes[scope].pending
                        ? "历史回填待核验"
                        : "已完成一次性历史回填"}
                      ：
                      {data.backfill.scopes[scope].delta === null
                        ? "缺少完整每日数据"
                        : `截至 ${data.backfill.scopes[scope].cutoff}，回填累计与目标表差额 ${money(data.backfill.scopes[scope].delta)}`}
                      {data.backfill.scopes[scope].pending
                        ? "；回填段与权威快照断开显示，最新实心圆仍采用目标表O列。"
                        : ""}
                      {data.backfill.scopes[scope].missing.length > 0
                        ? ` 缺失日期：${data.backfill.scopes[scope].missing.join("、")}`
                        : ""}
                    </div>
                  )}
                  <div className="legend">
                    <span className="legend-history" />
                    2025 历史节奏 <span className="legend-actual" />
                    2026 实际进度 <span className="legend-plan" />
                    2026 月度计划
                  </div>
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={points}
                        margin={{ top: 16, right: 24, left: 0, bottom: 4 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 4"
                          vertical={false}
                          stroke="#e8edf0"
                        />
                        <XAxis
                          dataKey="fullDate"
                          ticks={[
                            "2026-10-01",
                            "2026-10-15",
                            "2026-10-31",
                            "2026-11-15",
                            "2026-11-30",
                            "2026-12-15",
                            "2026-12-31",
                          ]}
                          tickFormatter={(v) => String(v).slice(5)}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 12, fill: "#849197" }}
                        />
                        <YAxis
                          domain={[0, curveMaximum(points)]}
                          allowDataOverflow
                          ticks={[
                            0,
                            0.25,
                            0.5,
                            0.75,
                            1,
                            ...(curveMaximum(points) > 1
                              ? [curveMaximum(points)]
                              : []),
                          ]}
                          tickFormatter={(v) => `${Math.round(v * 100)}%`}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 12, fill: "#849197" }}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0].payload;
                            return (
                              <div className="tooltip">
                                <b>{label}</b>
                                <p>
                                  2025 历史进度{" "}
                                  <strong>{pct(p.history)}</strong>
                                </p>
                                <p>
                                  2026 实际进度{" "}
                                  <strong>
                                    {p.actual == null
                                      ? "暂无实际数据"
                                      : pct(p.actual)}
                                  </strong>
                                </p>
                                <p>
                                  2026 计划进度 <strong>{pct(p.plan)}</strong>
                                </p>
                                {p.actual != null && (
                                  <p>
                                    {p.actualSource}
                                    {p.pending ? " · 待核验" : ""}
                                  </p>
                                )}
                                <p>
                                  进度差距 <strong>{pp(p.gap)}</strong>
                                </p>
                                <p>
                                  实际累计金额{" "}
                                  <strong>{money(p.amount)}</strong>
                                </p>
                                <p>
                                  历史节奏目标金额{" "}
                                  <strong>{money(p.targetAmount)}</strong>
                                </p>
                              </div>
                            );
                          }}
                        />
                        <ReferenceLine
                          x={data.cutoff}
                          stroke="#a2acae"
                          strokeDasharray="3 3"
                          label={{
                            value: "数据截至",
                            position: "insideTopRight",
                            fill: "#78858a",
                            fontSize: 11,
                          }}
                        />
                        <Line
                          name="2025历史"
                          type="linear"
                          dataKey="history"
                          stroke="#8195ad"
                          strokeWidth={2.6}
                          strokeDasharray="10 7"
                          activeDot={{
                            r: 6,
                            fill: "#8195ad",
                            stroke: "white",
                            strokeWidth: 2,
                          }}
                          dot={false}
                        />
                        <Line
                          name="月度计划"
                          type="linear"
                          dataKey="plan"
                          stroke="#dd923e"
                          strokeWidth={1.8}
                          strokeDasharray="1 6"
                          strokeDashoffset={3}
                          strokeLinecap="round"
                          activeDot={{
                            r: 5,
                            fill: "#dd923e",
                            stroke: "white",
                            strokeWidth: 2,
                          }}
                          dot={false}
                        />
                        <Line
                          name="实际进度"
                          type="linear"
                          dataKey="actualLine"
                          stroke="#0b9d87"
                          strokeWidth={3.5}
                          dot={{
                            r: 3.5,
                            fill: "white",
                            stroke: "#0b9d87",
                            strokeWidth: 2,
                          }}
                          activeDot={{
                            r: 7,
                            fill: "#0b9d87",
                            stroke: "white",
                            strokeWidth: 2,
                          }}
                          isAnimationActive={false}
                          connectNulls={false}
                        />
                        <Line
                          name="回填实际（待核验）"
                          dataKey="actualBackfill"
                          stroke="#0b9d87"
                          strokeWidth={3.5}
                          dot={{
                            r: 3.5,
                            fill: "white",
                            stroke: "#0b9d87",
                            strokeWidth: 2,
                          }}
                          activeDot={{ r: 7 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                        <Line
                          name="最新权威实际"
                          dataKey="actualEndpoint"
                          stroke="#0b9d87"
                          strokeWidth={0}
                          dot={{
                            r: 6,
                            fill: "#0b9d87",
                            stroke: "white",
                            strokeWidth: 2,
                          }}
                          activeDot={{ r: 8 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-foot">
                    <span>
                      实际：10月31日采用P列锚点，已保存的每日O列快照优先；空缺历史使用一次性ERP回填，来源与差异见提示。
                    </span>
                    <span>
                      计划：月度目标 ×
                      2025同月每日销售权重；缺失历史月份不分配。
                    </span>
                  </div>
                </section>
              </>
            )}
            {tab === "经营总览" && (
              <section className="panel table-panel">
                <div className="panel-title">
                  <div>
                    <h2>运营组经营表现</h2>
                    <p>规模、目标进度与利润质量共同评价</p>
                  </div>
                  <span className="tag">目标表权威值</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "运营组",
                          "Q4销售额",
                          "目标完成率",
                          "历史差距",
                          "累计利润率",
                          "与所选目标差距",
                          "近7天销售额",
                          "近7天改善",
                          "核验状态",
                        ].map((x) => (
                          <th key={x}>{x}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SCOPES.slice(1).map((g) => {
                        const gm = metrics(data, g, tier),
                          r = recent(data, g, tier);
                        return (
                          <tr key={g}>
                            <td>
                              <button
                                className="table-link"
                                onClick={() => {
                                  setScope(g);
                                  setTab("经营总览");
                                }}
                              >
                                {g} <ChevronRight size={13} />
                              </button>
                            </td>
                            <td>{money(data.targets[g].sales)}</td>
                            <td>
                              <b>{pct(gm.progress)}</b>
                              <div className="progress">
                                <i
                                  style={{
                                    width: `${Math.min(gm.progress * 100, 100)}%`,
                                  }}
                                />
                              </div>
                            </td>
                            <td>
                              <Delta n={gm.gap} />
                            </td>
                            <td>{pct(data.targets[g].margin)}</td>
                            <td>
                              <Delta n={gm.marginGap} />
                            </td>
                            <td>{r ? money(r.sales) : "数据不足"}</td>
                            <td>{pp(r?.improvement)}</td>
                            <td>
                              <span
                                className={`status ${data.blocked.includes(g) ? "pending" : "ok"}`}
                              >
                                {data.blocked.includes(g)
                                  ? "数据待核验"
                                  : "已核验"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {tab === "优秀表现" && (
              <div className="rankings personnel-rankings">
                {[
                  {
                    key: "completion",
                    title: "销售目标完成率 Top 3",
                    period: "10—11月 · 准目标完成率",
                    entries: data.rankings?.completion ?? [],
                    percent: true,
                  },
                  {
                    key: "sales",
                    title: "销售额 Top 3",
                    period: "10月财务 · 销售额",
                    entries: data.rankings?.sales ?? [],
                    percent: false,
                  },
                  {
                    key: "profit",
                    title: "净利润 Top 3",
                    period: "10月财务 · 净利润",
                    entries: data.rankings?.profit ?? [],
                    percent: false,
                  },
                ].map((board) => (
                  <section
                    className="panel ranking"
                    key={board.key}
                    aria-label={board.title}
                  >
                    <span className="eyebrow">TOP 3 / OPERATORS</span>
                    <h2>{board.title}</h2>
                    <p>{board.period}</p>
                    {[1, 2, 3].map((rank) => {
                      const person = board.entries.find((p) => p.rank === rank);
                      return (
                        <div
                          className={`rank ${rank === 1 ? "rank-winner" : ""}`}
                          key={rank}
                        >
                          <b className="rank-number">{rank}</b>
                          <strong>{person?.name ?? "暂无数据"}</strong>
                          <span>
                            {person
                              ? board.percent
                                ? pct(person.value)
                                : (person.value / 10000).toLocaleString(
                                    "zh-CN",
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    },
                                  ) + " 万元"
                              : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
            {tab === "风险预警" && (
              <>
                <div className="risk-summary">
                  {["高", "中", "提示"].map((x) => (
                    <button
                      className="panel"
                      key={x}
                      onClick={() => setRiskLevel(x)}
                    >
                      <span>
                        {x === "高"
                          ? "高优先级"
                          : x === "中"
                            ? "需关注"
                            : "提示"}
                      </span>
                      <b>{allRisks.filter((r) => r.severity === x).length}</b>
                    </button>
                  ))}
                </div>
                <section className="panel table-panel">
                  <div className="panel-title">
                    <div>
                      <h2>自动风险识别</h2>
                      <p>按风险级别排序 · 不自动归因 · 暂不含人工处理台账</p>
                    </div>
                    <select
                      aria-label="风险级别"
                      value={riskLevel}
                      onChange={(e) => setRiskLevel(e.target.value)}
                    >
                      {["全部", "高", "中", "提示"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </div>
                  <div className="risk-list">
                    {risks.map((r, i) => (
                      <RiskRow key={i} risk={r} />
                    ))}
                    {!risks.length && (
                      <p className="rank-empty">当前筛选范围没有风险记录</p>
                    )}
                  </div>
                </section>
              </>
            )}
            {tab !== "优秀表现" && (
              <details className="panel methodology">
                <summary>
                  数据来源与计算说明 <span>权威指标 · 每日快照</span>
                </summary>
                <div>
                  <p>
                    销售、利润率及目标：01_经营目标。利润参考额 = O列销售额 ×
                    O列利润率；不是未经核验的ERP利润。
                  </p>
                  <p>
                    公司历史：2025年数据-国家每日；各组历史：父单每日。未归属销售保留，占父单总额{" "}
                    {pct(data.unmatched.share)}（{money(data.unmatched.sales)}
                    ）。
                  </p>
                  <p>
                    公司与四组汇总和T列历史进度自动交叉核验；ERP对账仅在读取明细时执行。金额容忍值为
                    max(100元, 对照金额×0.1%)；历史进度容忍
                    0.2pp。异常记录与完全重复候选不静默修正。
                  </p>
                  <p>
                    截止日期采用T11已确认业务日期；不能仅凭出现某日期的记录判断该日完整。抓取来源：
                    {data.source}
                    。正常刷新只读目标表，历史缓存仅初始化或明确重建时更新。刷新失败保留旧快照并明确标记。
                  </p>
                  <p>
                    月度计划不能当作实际；10月财务净利润与ERP销售净毛利不可混为财务结算利润。负责人没有个人目标时仅展示描述性结果。
                  </p>
                </div>
              </details>
            )}
          </>
        )}
        <footer>
          <span>2026 Q4 旺季经营总控台</span>
          <span>数据有依据，决策有方向</span>
        </footer>
      </main>
    </div>
  );
}
function RiskRow({ risk: r }: { risk: Risk }) {
  return (
    <article className="risk-row">
      <span
        className={`status ${r.severity === "高" ? "high" : r.severity === "中" ? "pending" : "neutral"}`}
      >
        {r.severity}
      </span>
      <div>
        <h3>{r.issue}</h3>
        <p>{r.evidence}</p>
        <small>建议：{r.action}</small>
      </div>
      <div className="risk-amount">
        <b>{r.scope}</b>
        <span>{r.amount == null ? "—" : money(r.amount)}</span>
      </div>
    </article>
  );
}
