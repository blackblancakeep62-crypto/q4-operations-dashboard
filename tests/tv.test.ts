import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import {spawnSync} from "node:child_process";
import {emptyTv, TV_SCOPES, tvFromRanges, tvPercent, tvNumber, tvDifference, tvDelayed, validateTv, TV_POLL_MS} from "../lib/tv";
const fixture = () => [{values: TV_SCOPES.map(name => [name, .42, .41, .38, .39, .34])}, {values: TV_SCOPES.map(name => [name, "待更新", "#DIV/0!"])}];
test("TV preserves formula results, real zero, overachievement and missing values", () => {
  const input = fixture();
  input[0].values[1][2] = 0; input[0].values[2][2] = 1.23;
  const snapshot = tvFromRanges(input);
  assert.equal(snapshot.q4[0].sales, .41);
  assert.equal(snapshot.q4[0].profit, .39);
  assert.equal(tvPercent(snapshot.q4[1].sales), "0.00%");
  assert.equal(tvPercent(snapshot.q4[2].sales), "123.00%");
  assert.ok(snapshot.campaign.every(r => r.sales === null && r.profit === null));
  for (const value of ["待更新", "", "#N/A", "#VALUE!", "0", null, undefined, NaN, Infinity, false]) assert.equal(tvNumber(value), null);
  assert.equal(tvPercent(null), "暂无数据");
  assert.equal(tvDifference(.41, .42), "-1.00 pp");
  assert.equal(tvDifference(null, .42), "暂无数据");
  assert.deepEqual(validateTv({...snapshot, secret: "must-strip"}), snapshot);
  input[0].values.reverse(); assert.throws(() => tvFromRanges(input));
});
test("TV stale policy uses last success, failure flags, and a three-minute polling interval", () => {
  const data = tvFromRanges(fixture(), "2026-11-18T00:00:00Z");
  const start = Date.parse(data.fetchedAt!);
  assert.equal(TV_POLL_MS, 180000);
  assert.equal(tvDelayed(data, start + 90 * 60000), false);
  assert.equal(tvDelayed(data, start + 90 * 60000 + 1), true);
  assert.equal(tvDelayed({...data, ok: false}, start), true);
  assert.equal(tvDelayed(data, start, true), true);
  assert.equal(tvDelayed(emptyTv(), start), true);
  assert.throws(() => validateTv({...data, fetchedAt: "invalid"}));
});
test("authenticated GAS television action reads exactly 45 cells and no ERP or dashboard ranges", () => {
  const accessed: string[] = [];
  let opened = 0;
  const key = "test-only-tv-shared-key-with-32-characters";
  const context = vm.createContext({
    PropertiesService: {getScriptProperties: () => ({getProperty: () => key})},
    ContentService: {MimeType: {JSON: "json"}, createTextOutput: (text: string) => ({setMimeType: () => JSON.parse(text)})},
    SpreadsheetApp: {openById: (id: string) => {opened++; assert.equal(id, "19mz6u9eRFfN0zCsbtHxWJ6Ib0WN5lZwdMq2nftULcgI"); return {
      getSheetByName: (name: string) => {assert.equal(name, "电视投屏数据"); return {getSheetId: () => 118366337, getRange: (range: string) => {
        accessed.push(range); return {getValues: () => fixture()[range === "A3:F7" ? 0 : 1].values};
      }};},
    };}},
  });
  vm.runInContext(fs.readFileSync("gas/Code.gs", "utf8") + fs.readFileSync("gas/Television.gs", "utf8"), context);
  const call = (secret: string) => context.doPost({postData: {contents: JSON.stringify({key: secret, action: "readTv", range: "ERP!A:Z"})}});
  assert.equal(call("wrong").ok, false); assert.equal(opened, 0);
  const result = call(key); assert.equal(result.ok, true);
  assert.deepEqual(accessed, ["A3:F7", "A12:C16"]);
  assert.equal(tvFromRanges(result.valueRanges).campaign[0].sales, null);
});
test("failed TV sync retains last success and leaves dashboard bytes untouched", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "q4-tv-"));
  try {
    const prior = tvFromRanges(fixture(), "2026-11-18T00:00:00Z");
    fs.writeFileSync(path.join(dir, "tv-snapshot-v1.json"), JSON.stringify(prior));
    fs.writeFileSync(path.join(dir, "snapshot-v2.json"), "unchanged-dashboard-bytes");
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/sync-tv.ts"], {env: {...process.env, CACHE_DIR: dir, GAS_SHARED_KEY: "", GAS_WEB_APP_URL: ""}, encoding: "utf8"});
    assert.equal(result.status, 0, result.stderr);
    const after = JSON.parse(fs.readFileSync(path.join(dir, "tv-snapshot-v1.json"), "utf8"));
    assert.equal(after.ok, false); assert.equal(after.fetchedAt, prior.fetchedAt);
    assert.deepEqual(after.q4, prior.q4); assert.deepEqual(after.campaign, prior.campaign);
    assert.equal(fs.readFileSync(path.join(dir, "snapshot-v2.json"), "utf8"), "unchanged-dashboard-bytes");
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
