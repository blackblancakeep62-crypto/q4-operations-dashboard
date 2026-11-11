import test from "node:test";
import assert from "node:assert/strict";
import { backfillNovember } from "../lib/backfill";
import { curve, curveMaximum, type Snapshot, type Rows } from "../lib/model";
import { SCOPES, TIERS } from "../lib/config";
function fixture() {
  const s = {
    cutoff: "2026-11-03",
    fetchedAt: "2026-11-04T00:00:00Z",
    targets: {},
    actualHistory: {},
    history: {},
  } as Snapshot;
  for (const g of SCOPES) {
    s.targets[g] = {
      sales: 127,
      october: 100,
      november: 27,
      december: null,
      standardProgress: 0.127,
      margin: 0.2,
      profit: 25.4,
      historical: 0.1,
      tiers: Object.fromEntries(
        TIERS.map((t) => [
          t,
          { sales: 1000, margin: 0.2, months: [300, 300, 400] },
        ]),
      ) as never,
    };
    s.actualHistory[g] = {
      "2026-11-03": {
        sales: 127,
        margin: 0.2,
        historical: 0.1,
        capturedAt: s.fetchedAt,
        source: "target",
      },
    };
  }
  const rows: Rows = [
    ["日期", "ASIN", "国家", "销售额", "销售净毛利", "运营负责人", "组别"],
    ["2026-11-01", "A", "US", 10, 2, "Owner", "一组"],
    ["2026-11-02", "A", "US", 10, 2, "Owner", "一组"],
    ["2026-11-03", "A", "US", 10, 2, "Owner", "一组"],
  ];
  return { s, rows };
}
test("backfill applies ERP once and preserves P anchor/O authoritative endpoint", () => {
  const { s, rows } = fixture(),
    r = backfillNovember(s, rows, s.fetchedAt);
  assert.equal(r.actualHistory["一组"]["2026-11-01"].sales, 109);
  assert.equal(r.actualHistory["一组"]["2026-11-02"].sales, 118);
  assert.equal(r.actualHistory["一组"]["2026-11-03"].sales, 127);
  assert.equal(r.actualHistory["一组"]["2026-11-03"].source, "target");
  assert.equal(r.report.scopes["一组"].delta, 0);
  s.actualHistory = r.actualHistory;
  s.backfill = r.report;
  for (const tier of TIERS) {
    const p = curve(s, "一组", tier);
    assert.equal(p[30].amount, 100);
    assert.equal(p[33].amount, 127);
    assert.ok(p.slice(34).every((p) => p.actual === null));
  }
  const again = backfillNovember(s, rows, s.fetchedAt);
  assert.equal(again.report.scopes["一组"].inserted, 0);
  assert.equal(again.actualHistory["一组"]["2026-11-01"].sales, 109);
});
test("missing date stops accumulation instead of zero filling or interpolation", () => {
  const { s, rows } = fixture();
  rows.splice(2, 1);
  const r = backfillNovember(s, rows, s.fetchedAt);
  assert.deepEqual(r.report.scopes["一组"].missing, ["2026-11-02"]);
  assert.equal(r.actualHistory["一组"]["2026-11-02"], undefined);
  assert.equal(r.report.scopes["一组"].delta, null);
  assert.equal(r.actualHistory["一组"]["2026-11-01"].pending, true);
});
test("material discrepancy separates pending backfill from authority point and keeps latest dot", () => {
  const { s, rows } = fixture();
  s.targets["一组"].sales = 2000;
  s.actualHistory["一组"]["2026-11-03"].sales = 2000;
  const r = backfillNovember(s, rows, s.fetchedAt);
  s.actualHistory = r.actualHistory;
  s.backfill = r.report;
  const points = curve(s, "一组", "准目标");
  assert.equal(points[32].actualLine, null);
  assert.equal(points[32].actualBackfill, 0.118);
  assert.equal(points[33].actualLine, 2);
  assert.equal(points[33].actualEndpoint, 2);
  assert.equal(points[33].actualBackfill, null);
  assert.equal(curveMaximum(points), 2);
  assert.equal(
    curveMaximum([{ actual: 1 + 1e-12, history: 1, plan: 1 }] as never),
    1,
  );
});
