import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { publicData } from "../lib/public-data";
import { curve, metrics, businessRisks, recent, type Snapshot } from "../lib/model";
import { SCOPES, TIERS } from "../lib/config";
test("public payload preserves all dashboard calculations and strips non-dashboard detail", () => {
  const s = JSON.parse(fs.readFileSync("pages-seed/snapshot-v2.json", "utf8")) as Snapshot;
  const polluted = {...s, owners: {secret: {asin: "DO-NOT-PUBLISH"}}, daily: {raw: "DO-NOT-PUBLISH"},
    credentials: "DO-NOT-PUBLISH", error: "DO-NOT-PUBLISH", stale: true} as unknown as Snapshot;
  const projected = publicData(polluted);
  assert.equal(JSON.stringify(projected).includes("DO-NOT-PUBLISH"), false);
  assert.equal("owners" in projected, false);
  assert.equal("daily" in projected, false);
  for (const g of SCOPES) for (const tier of TIERS) {
    assert.deepEqual(curve(projected, g, tier), curve(s, g, tier));
    assert.deepEqual(metrics(projected, g, tier), metrics(s, g, tier));
    assert.deepEqual(recent(projected, g, tier), recent(s, g, tier));
  }
  for (const tier of TIERS) assert.deepEqual(businessRisks(projected, tier), businessRisks(s, tier));
  assert.deepEqual(projected.rankings, s.rankings);
});
