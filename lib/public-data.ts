import { SCOPES, TIERS } from "./config";
import type { DashboardData, Snapshot } from "./model";
// Explicit nested projection: adding fields to Snapshot never publishes them implicitly.
export function publicData(s: Snapshot): DashboardData {
  const targets = Object.fromEntries(SCOPES.map((g) => {
    const t = s.targets[g];
    return [g, {
      sales: t.sales, standardProgress: t.standardProgress, margin: t.margin,
      october: t.october, november: t.november, december: t.december,
      historical: t.historical, profit: t.profit,
      tiers: Object.fromEntries(TIERS.map((tier) => [tier, {
        sales: t.tiers[tier].sales, margin: t.tiers[tier].margin, months: t.tiers[tier].months.slice(0, 3),
      }])),
    }];
  })) as DashboardData["targets"];
  const validDate = (d: string, year: string) => new RegExp(`^${year}-(10|11|12)-\\d{2}$`).test(d);
  const rankings = s.rankings && Object.fromEntries(["completion", "sales", "profit"].map((key) => [key,
    s.rankings![key as keyof typeof s.rankings].slice(0, 3).map(({rank, name, value}) => ({rank, name, value})),
  ])) as DashboardData["rankings"];
  return {
    version: 2, fetchedAt: s.fetchedAt, cutoff: s.cutoff, targets, rankings,
    history: Object.fromEntries(SCOPES.map((g) => [g, Object.fromEntries(
      Object.entries(s.history[g] ?? {}).filter(([d]) => validDate(d, "2025")).map(([d, v]) => [d, { sales: v.sales }]),
    )])),
    actualHistory: Object.fromEntries(SCOPES.map((g) => [g, Object.fromEntries(
      Object.entries(s.actualHistory[g] ?? {}).filter(([d]) => validDate(d, "2026") && d <= s.cutoff)
        .map(([d, v]) => [d, { sales: v.sales, margin: v.margin, source: v.source, ...(v.pending ? {pending: true} : {}) }]),
    )])),
    backfill: s.backfill && { createdAt: s.backfill.createdAt, scopes: Object.fromEntries(SCOPES.flatMap((g) => {
      const v = s.backfill?.scopes[g];
      return v ? [[g, {cutoff: v.cutoff, delta: v.delta, tolerance: v.tolerance, missing: v.missing,
        duplicates: v.duplicates, invalid: v.invalid, pending: v.pending, inserted: v.inserted}]] : [];
    })) },
    risks: s.risks.map(({scope, severity, issue, evidence, action, amount}) => ({scope, severity, issue, evidence, action, amount})),
    blocked: s.blocked.filter((g) => SCOPES.includes(g as typeof SCOPES[number])),
    unmatched: {sales: s.unmatched.sales, share: s.unmatched.share},
    source: "Google Sheets · 经营目标公式结果及历史汇总缓存",
    stale: !!s.stale,
    ...(s.stale ? {error: "本次自动同步未成功，保留最近一次有效数据。"} : {}),
  };
}
