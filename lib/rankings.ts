import type { Rows } from "./model";
export type RankingEntry = { rank: number; name: string; value: number };
export type PersonnelRankings = {
  completion: RankingEntry[];
  sales: RankingEntry[];
  profit: RankingEntry[];
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
  const completion = rows
    .slice(54, 74)
    .flatMap((r) => {
      const n = name(r[0]),
        v = value(r[6]);
      return n && v !== null ? [{ rank: 0, name: n, value: v }] : [];
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const ranked = (rankCol: number, nameCol: number, valueCol: number) =>
    rows.slice(76, 79).flatMap((r) => {
      const n = name(r[nameCol]),
        v = value(r[valueCol]),
        rank = value(r[rankCol]);
      return n && v !== null && rank !== null && [1, 2, 3].includes(rank)
        ? [{ rank, name: n, value: v }]
        : [];
    });
  return { completion, sales: ranked(0, 1, 2), profit: ranked(4, 5, 6) };
}
