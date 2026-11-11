import { aggregateHistory, aggregateDetails } from "../lib/erp";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSnapshot,
  curve,
  metrics,
  recent,
  businessRisks,
  numeric,
  date,
  days,
  type Raw,
  type Rows,
} from "../lib/model";
import { SCOPES, TIERS, sheetNames } from "../lib/config";
// Isolated synthetic fixtures for unit tests only. Never imported by the application.
function fixture(): Raw {
  const targets: Rows = Array.from({ length: 48 }, () => []);
  targets[10][19] = "2026-11-08";
  targets[11][19] = 39 / 92;
  targets[13] = [
    "合计",
    "第 1 列",
    "进阶目标",
    "准目标",
    "生存目标",
    "进阶目标",
    "准目标",
    "生存目标",
    "进阶目标",
    "准目标",
    "生存目标",
    "进阶目标",
    "准目标",
    "生存目标",
    "目前完成情况",
    "完成情况（财务）",
    "每日完成（杰航）",
    "暂未开始",
  ];
  SCOPES.forEach((g, i) => {
    const n = i === 0 ? 4 : 1,
      idx = [14, 21, 29, 37, 45][i],
      label = i === 0 ? "合计" : g;
    targets[idx] = [
      label,
      "总销售额",
      184 * n,
      92 * n,
      46 * n,
      62 * n,
      31 * n,
      15.5 * n,
      60 * n,
      30 * n,
      15 * n,
      62 * n,
      31 * n,
      15.5 * n,
      39 * n,
      31 * n,
      8 * n,
      null,
      39 / 92,
      39 / 92,
    ];
    targets[idx + 1] = [
      label,
      "总利润率",
      0.3,
      0.2,
      0.1,
      ...Array(9).fill(0.2),
      0.2,
    ];
  });
  const parent: Rows = [
      [
        "日期",
        "ASIN",
        "国家",
        "销量",
        "订单量",
        "销售额",
        "销售净毛利",
        "组别",
      ],
    ],
    country: Rows = [["日期", "销售额"]],
    erp: Rows = [
      ["日期", "ASIN", "国家", "销售额", "销售净毛利", "运营负责人", "组别"],
    ],
    oct: Rows = [
      ["分组", "销售额（人民币）", "净利润（人民币）", "运营负责人"],
    ];
  for (const d of days("2025-10-01", "2025-12-31")) {
    country.push([d, 4]);
    for (const g of SCOPES.slice(1)) parent.push([d, g, "US", 1, 1, 1, 0.2, g]);
  }
  for (const g of SCOPES.slice(1)) {
    oct.push([g, 31, 6.2, `owner-${g}`]);
    for (const d of days("2026-11-01", "2026-11-08"))
      erp.push([d, g, "US", 1, 0.2, `owner-${g}`, g]);
  }
  return {
    [sheetNames.target]: targets,
    [sheetNames.country]: country,
    [sheetNames.parent]: parent,
    [sheetNames.erp]: erp,
    [sheetNames.october]: oct,
  };
}
const build = (r = fixture()) => {
  const s = buildSnapshot(
    r,
    "2026-11-10T00:00:00Z",
    "unit-test",
    aggregateHistory(r).history,
  );
  for (const g of SCOPES)
    s.actualHistory[g] = {
      "2026-11-08": {
        sales: s.targets[g].sales,
        margin: s.targets[g].margin,
        historical: s.targets[g].historical,
        capturedAt: s.fetchedAt,
        source: "target",
      },
    };
  return s;
};
test("format parsing", () => {
  assert.equal(numeric("￥1,234.50"), 1234.5);
  assert.equal(numeric("15.5%"), 0.155);
  assert.equal(date(46334), "2026-11-08");
  assert.equal(date("2026-02-31"), null);
});
test("authority O/P/S/T untouched and every scope/tier supported", () => {
  const r = fixture();
  r[sheetNames.target][14][18] = 0.4321;
  const s = build(r);
  assert.equal(s.targets["公司"].sales, 156);
  assert.equal(metrics(s, "公司", "准目标").progress, 0.4321);
  for (const g of SCOPES)
    for (const t of TIERS) {
      assert.equal(curve(s, g, t).length, 92);
      assert.equal(metrics(s, g, t).remainingDays, 53);
      if (t !== "准目标")
        assert.equal(
          metrics(s, g, t).progress,
          s.targets[g].sales / s.targets[g].tiers[t].sales,
        );
    }
});
test("P anchor and O snapshots; missing dates not fabricated", () => {
  const s = build(),
    p = curve(s, "一组", "准目标");
  assert.ok(p.slice(0, 30).every((x) => x.actual === null));
  assert.equal(p[30].amount, 31);
  assert.equal(p[31].amount, null);
  assert.equal(p[38].amount, 39);
  assert.equal(p[39].actual, null);
  assert.ok(Math.abs(p[91].history! - 1) < 1e-10);
  assert.ok(Math.abs(p[91].plan! - 1) < 1e-10);
});
test("T authoritative at cutoff, cache discrepancy does not block actual", () => {
  const r = fixture();
  r[sheetNames.target][21][19] = 0.7;
  const s = build(r);
  assert.equal(curve(s, "一组", "准目标")[38].history, 0.7);
  assert.equal(curve(s, "一组", "准目标")[38].amount, 39);
  assert.ok(s.risks.some((r) => r.issue.includes("T列")));
  assert.deepEqual(s.blocked, []);
});
test("ERP applies once; financial and official values never transformed", () => {
  const r = fixture(),
    original = JSON.stringify(r);
  const a = aggregateDetails(r, "2026-11-08"),
    b = aggregateDetails(r, "2026-11-08");
  assert.equal(a.daily["一组"]["2026-11-01"].sales, 0.9);
  assert.equal(a.daily["一组"]["2026-11-01"].profit, 0.17);
  assert.equal(a.owners["一组 / owner-一组"].october.sales, 31);
  assert.equal(a.owners["一组 / owner-一组"].october.profit, 6.2);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(r), original);
  assert.equal(build(r).targets["一组"].sales, 39);
});
test("duplicates only affect details; unknown group retained", () => {
  const r = fixture();
  r[sheetNames.erp].push([...r[sheetNames.erp][1]]);
  r[sheetNames.parent].push([
    "2025-10-01",
    "unknown",
    "US",
    1,
    1,
    20,
    2,
    "未知",
  ]);
  const d = aggregateDetails(r, "2026-11-08"),
    s = build(r);
  assert.ok(d.risks.some((r) => r.evidence.includes("重复")));
  assert.equal(s.unmatched.sales, 18);
  assert.equal(curve(s, "公司", "准目标")[38].amount, 156);
});
test("company reconciliation and authoritative profit risk", () => {
  const r = fixture();
  r[sheetNames.target][14][14] = 1000;
  r[sheetNames.target][22][14] = -0.1;
  const s = build(r);
  assert.ok(s.risks.some((r) => r.issue.includes("四组与公司")));
  assert.ok(
    businessRisks(s, "准目标").some(
      (r) => r.scope === "一组" && r.severity === "高",
    ),
  );
});
test("7-day trend uses consecutive persistent snapshots, not ERP", () => {
  const s = build();
  assert.equal(recent(s, "一组", "准目标"), null);
  for (const [i, d] of days("2026-11-01", "2026-11-08").entries())
    s.actualHistory["一组"][d] = {
      sales: 32 + i,
      margin: 0.2,
      historical: (32 + i) / 92,
      capturedAt: s.fetchedAt,
      source: "target",
    };
  assert.equal(recent(s, "一组", "准目标")?.sales, 7);
  assert.ok(Math.abs(recent(s, "一组", "准目标")!.improvement!) < 1e-10);
});
test("invalid mandatory target rejected instead of zero", () => {
  const r = fixture();
  r[sheetNames.target][14][14] = null;
  assert.throws(() => build(r), /目标数据缺失/);
});
test("single-group invalid field retains only its prior value", () => {
  const old = build(),
    r = fixture();
  r[sheetNames.target][21][14] = null;
  r[sheetNames.target][29][14] = 99;
  const s = buildSnapshot(
    r,
    "2026-11-10T01:00:00Z",
    "test",
    old.history,
    {},
    old.targets,
  );
  assert.equal(s.targets["一组"].sales, 39);
  assert.equal(s.targets["二组"].sales, 99);
  assert.deepEqual(s.blocked, ["一组"]);
});
