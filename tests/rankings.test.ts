import test from "node:test";
import assert from "node:assert/strict";
import { parseRankings, growthPercent } from "../lib/rankings";
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
test("growth rankings use H/I independently, reject invalid values and preserve signs", () => {
  const rows: Rows = Array.from({length:79}, () => []);
  const inputs = [
    ["周东", 0.406, 1.144], ["陈嵩涛", 0.464, 2.824], ["李欣淇", "28.6%", "146.4%"],
    ["Other", -0.2, -0.3], ["Empty", "", null], ["Error", "#DIV/0!", "#VALUE!"],
    ["Invalid", "abc", Infinity], ["无", 99, 99],
  ];
  inputs.forEach(([name,sales,profit],i) => {rows[54+i]=[name,null,null,null,null,null,0.5,sales,profit] as Rows[number];});
  const r=parseRankings(rows);
  assert.deepEqual(r.salesGrowth?.map(p=>[p.name,growthPercent(p.value)]), [["陈嵩涛","+46.4%"],["周东","+40.6%"],["李欣淇","+28.6%"]]);
  assert.deepEqual(r.profitGrowth?.map(p=>[p.name,growthPercent(p.value)]), [["陈嵩涛","+282.4%"],["李欣淇","+146.4%"],["周东","+114.4%"]]);
  assert.deepEqual(parseRankings([]), {completion:[],salesGrowth:[],profitGrowth:[]});
  assert.equal(growthPercent(-0.123), "-12.3%");
  assert.equal(growthPercent(0), "+0.0%");
  rows[54]=["New person",null,null,null,null,null,0.5,-0.01,-0.02];
  assert.equal(parseRankings(rows.slice(0,55)).salesGrowth?.[0].name,"New person");
  assert.equal(parseRankings(rows.slice(0,55)).salesGrowth?.[0].value,-0.01);
});
