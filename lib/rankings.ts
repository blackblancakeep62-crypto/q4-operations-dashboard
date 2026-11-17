import type { Rows } from "./model";
export type RankingEntry = {
  rank: number | null;
  name: string;
  value: number | null;
};
export type PersonnelRankings = {
  completion: RankingEntry[];
  salesGrowth?: RankingEntry[];
  profitGrowth?: RankingEntry[];
};
function value(cell: unknown): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== "string") return null;
  const s = cell.trim().replace(/[,，￥¥\s]/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(s)) return null;
  const n = Number(s.replace("%", "")) / (s.endsWith("%") ? 100 : 1);
  return Number.isFinite(n) ? n : null;
}
function name(cell: unknown) {
  return typeof cell === "string" && cell.trim() !== "无" ? cell.trim() : "";
}
export function parseRankings(rows: Rows): PersonnelRankings {
  const ranked = (column: number): RankingEntry[] => {
    const people = rows.slice(54, 70).flatMap((r) => {
      const n = name(r[0]),
        v = value(r[column]);
      return n ? [{ name: n, value: v }] : [];
    });
    const valid = people
      .filter((p): p is { name: string; value: number } => p.value !== null)
      .sort((a, b) => b.value - a.value)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    return [
      ...valid,
      ...people
        .filter((p) => p.value === null)
        .map((p) => ({ ...p, rank: null })),
    ];
  };
  return {
    completion: ranked(6),
    salesGrowth: ranked(7),
    profitGrowth: ranked(8),
  };
}
export const growthPercent = (n: number) =>
  `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
