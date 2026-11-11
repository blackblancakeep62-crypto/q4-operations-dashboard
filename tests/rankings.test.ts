import test from "node:test";
import assert from "node:assert/strict";
import { parseRankings } from "../lib/rankings";
import type { Rows } from "../lib/model";
test("completion sorts valid results only, without applying ERP factors", () => {
  const rows: Rows = Array.from({ length: 79 }, () => []);
  ["", null, "无", "invalid", Infinity].forEach(
    (v, i) => (rows[54 + i] = ["Excluded", null, null, null, null, null, v]),
  );
  rows[59] = ["A", null, null, null, null, null, 0.83];
  rows[60] = ["B", null, null, null, null, null, "90.25%"];
  rows[61] = ["C", null, null, null, null, null, 0.71];
  rows[62] = ["D", null, null, null, null, null, 0.4];
  rows[63] = ["无", null, null, null, null, null, 1];
  assert.deepEqual(parseRankings(rows).completion, [
    { rank: 1, name: "B", value: 0.9025 },
    { rank: 2, name: "A", value: 0.83 },
    { rank: 3, name: "C", value: 0.71 },
  ]);
});
test("financial rankings preserve supplied order and exact values, blanks stay absent", () => {
  const rows: Rows = Array.from({ length: 79 }, () => []);
  rows[76] = [1, "First", 100000, null, 1, "P1", 20000];
  rows[77] = [2, "Second", 900000, null, 2, "P2", 50000];
  rows[78] = [3, "无", 800000, null, 3, "P3", -1000];
  const r = parseRankings(rows);
  assert.deepEqual(
    r.sales.map((x) => x.name),
    ["First", "Second"],
  );
  assert.equal(r.sales[0].value, 100000);
  assert.deepEqual(
    r.profit.map((x) => x.value),
    [20000, 50000, -1000],
  );
  assert.deepEqual(parseRankings([]), {
    completion: [],
    sales: [],
    profit: [],
  });
});
