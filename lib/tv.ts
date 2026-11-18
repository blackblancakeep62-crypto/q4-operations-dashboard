export const TV_RANGES = ["A3:F7", "A12:C16"];
export const TV_SCOPES = ["公司总", "运营一组", "运营二组", "运营三组", "运营四组"];
export const TV_POLL_MS = 3 * 60 * 1000;
export type TvRow = { name: string; previous: number | null; sales: number | null; salesAdvanced: number | null; profit: number | null; profitAdvanced: number | null };
export type TvCampaign = { name: string; sales: number | null; profit: number | null };
export type TvSnapshot = { version: 1; fetchedAt: string | null; attemptedAt: string | null; ok: boolean; q4: TvRow[]; campaign: TvCampaign[] };
// getValues returns numeric formula results. Text, errors, empty cells and booleans are missing, never zero.
export const tvNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
export const tvPercent = (value: number | null) => value === null ? "暂无数据" : `${(value * 100).toFixed(2)}%`;
export function tvDifference(current: number | null, previous: number | null) {
  if (current === null || previous === null) return "暂无数据";
  const delta = (current - previous) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} pp`;
}
export function tvDelayed(snapshot: TvSnapshot | null, now: number, failed = false) {
  return failed || !snapshot?.ok || !snapshot.fetchedAt || now - Date.parse(snapshot.fetchedAt) > 90 * 60 * 1000;
}
export function emptyTv(): TvSnapshot {
  return { version: 1, fetchedAt: null, attemptedAt: null, ok: false,
    q4: TV_SCOPES.map(name => ({name, previous: null, sales: null, salesAdvanced: null, profit: null, profitAdvanced: null})),
    campaign: TV_SCOPES.map(name => ({name, sales: null, profit: null})) };
}
export function tvFromRanges(ranges: {values: unknown[][]}[], now = new Date().toISOString()): TvSnapshot {
  if (ranges.length !== 2) throw Error("Invalid TV ranges");
  for (let i = 0; i < 2; i++) {
    if (ranges[i].values.length !== 5 || ranges[i].values.some((row, index) => row.length !== (i ? 3 : 6) || row[0] !== TV_SCOPES[index]))
      throw Error("TV row labels or dimensions changed");
  }
  return {version: 1, fetchedAt: now, attemptedAt: now, ok: true,
    q4: ranges[0].values.map(([name, previous, sales, salesAdvanced, profit, profitAdvanced]) => ({name: String(name), previous: tvNumber(previous), sales: tvNumber(sales), salesAdvanced: tvNumber(salesAdvanced), profit: tvNumber(profit), profitAdvanced: tvNumber(profitAdvanced)})),
    campaign: ranges[1].values.map(([name, sales, profit]) => ({name: String(name), sales: tvNumber(sales), profit: tvNumber(profit)}))};
}
// Project an allowlist before publishing or accepting a downloaded snapshot.
export function validateTv(value: unknown): TvSnapshot {
  const input = value as TvSnapshot;
  if (!input || input.version !== 1 || typeof input.ok !== "boolean" ||
      ![input.fetchedAt, input.attemptedAt].every(t => t === null || (typeof t === "string" && Number.isFinite(Date.parse(t)))) ||
      (input.ok && !input.fetchedAt) || !Array.isArray(input.q4) || !Array.isArray(input.campaign)) throw Error("Invalid TV snapshot");
  const ranges = [
    {values: input.q4.map(r => [r.name, r.previous, r.sales, r.salesAdvanced, r.profit, r.profitAdvanced])},
    {values: input.campaign.map(r => [r.name, r.sales, r.profit])},
  ];
  if (ranges.some(range => range.values.some(row => row.slice(1).some(v => v !== null && tvNumber(v) === null)))) throw Error("Invalid TV number");
  return {...tvFromRanges(ranges), fetchedAt: input.fetchedAt, attemptedAt: input.attemptedAt, ok: input.ok};
}
