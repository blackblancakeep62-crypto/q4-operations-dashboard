import {
  days,
  date,
  numeric,
  type Snapshot,
  type Rows,
  type ActualHistory,
  type BackfillReport,
} from "./model";
import { SCOPES, thresholds } from "./config";
import { normalizeERP } from "./erp";
// Explicit one-time operation; never called by dashboard refresh.
export function backfillNovember(s: Snapshot, rows: Rows, at: string) {
  const all: ActualHistory = structuredClone(s.actualHistory),
    report: BackfillReport = { createdAt: at, scopes: {} };
  const daily: Record<string, Record<string, number>> = {};
  let invalid = 0;
  const duplicate: Record<string, number> = {};
  const seen = new Set<string>();
  if (
    rows[0]?.[0] !== "日期" ||
    rows[0]?.[3] !== "销售额" ||
    rows[0]?.[6] !== "组别"
  )
    throw Error("ERP表头变更，停止回填");
  for (const r of rows.slice(1)) {
    if (!r.some((x) => x !== null && x !== "")) continue;
    const d = date(r[0]),
      amount = numeric(r[3]);
    if (!d || amount === null) {
      invalid++;
      continue;
    }
    if (d < "2026-11-01" || d > "2026-11-30" || d > s.cutoff) continue;
    const g =
      SCOPES.slice(1).find((g) => g === String(r[6] ?? "").trim()) ?? "未归属";
    const key = JSON.stringify(r);
    if (seen.has(key)) {
      duplicate["公司"] = (duplicate["公司"] ?? 0) + 1;
      duplicate[g] = (duplicate[g] ?? 0) + 1;
    }
    seen.add(key);
    const value = normalizeERP(amount, 0).sales;
    for (const scope of ["公司", g]) {
      daily[scope] ??= {};
      daily[scope][d] = (daily[scope][d] ?? 0) + value;
    }
  }
  for (const g of SCOPES) {
    all[g] ??= {};
    const first = Object.entries(all[g])
      .filter(
        ([d, p]) => d >= "2026-11-01" && d <= s.cutoff && p.source === "target",
      )
      .sort(([a], [b]) => a.localeCompare(b))[0];
    if (!first) continue;
    const [cutoff, official] = first;
    const ds = days("2026-11-01", cutoff),
      missing = ds.filter((d) => daily[g]?.[d] === undefined);
    const expected = official.sales - s.targets[g].october;
    const tolerance = Math.max(
      thresholds.moneyAbsolute,
      Math.abs(expected) * thresholds.moneyRelative,
    );
    const sum = ds.reduce((a, d) => a + (daily[g]?.[d] ?? 0), 0);
    const delta = missing.length
      ? null
      : s.targets[g].october + sum - official.sales;
    const pending =
      missing.length > 0 ||
      invalid > 0 ||
      (duplicate[g] ?? 0) > 0 ||
      (delta !== null && Math.abs(delta) > tolerance);
    let cumulative = s.targets[g].october,
      inserted = 0;
    for (const d of ds) {
      if (daily[g]?.[d] === undefined) break;
      cumulative += daily[g][d];
      if (!all[g][d]) {
        all[g][d] = {
          sales: cumulative,
          margin: null,
          historical: 0,
          capturedAt: at,
          source: "erp-backfill",
          pending,
        };
        inserted++;
      }
    }
    report.scopes[g] = {
      cutoff,
      delta,
      tolerance,
      missing,
      duplicates: duplicate[g] ?? 0,
      invalid,
      pending,
      inserted,
    };
  }
  return { actualHistory: all, report, unmatched: daily["未归属"] ?? {} };
}
