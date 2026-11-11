import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import { SCOPES } from "../lib/config";
import type { Snapshot, Rows } from "../lib/model";
test("batch formula values, target-only refresh, durable same-day upsert and cached history", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "q4-refresh-"));
  process.env.CACHE_DIR = dir;
  process.env.GOOGLE_SPREADSHEET_ID = "test-spreadsheet";
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{}";
  delete process.env.GOOGLE_REFRESH_TOKEN;
  const originalToken = GoogleAuth.prototype.getAccessToken,
    originalFetch = global.fetch;
  GoogleAuth.prototype.getAccessToken = async () => "test-token";
  const { writeStore, persistDaily, readStore } = await import("../lib/store");
  const { getSnapshot } = await import("../lib/data");
  const { TARGET_RANGES } = await import("../lib/sheets");
  const rows: Rows = Array.from({ length: 79 }, () => []);
  rows[10][19] = "2026-11-08";
  rows[13] = [
    "合计",
    "第 1 列",
    "进阶目标",
    "准目标",
    "生存目标",
    ...Array(9).fill("月度"),
    "目前完成情况",
    "完成情况（财务）",
    "每日完成（杰航）",
    "暂未开始",
  ];
  SCOPES.forEach((g, i) => {
    const r = [14, 21, 29, 37, 45][i],
      n = i === 0 ? 4 : 1;
    rows[r] = [
      i === 0 ? "合计" : g,
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
      0.4321,
      39 / 92,
    ];
    rows[r + 1] = [
      i === 0 ? "合计" : g,
      "总利润率",
      0.3,
      0.2,
      0.1,
      ...Array(9).fill(0.2),
      0.2,
    ];
  });
  await writeStore("history-v2.json", {
    policy: "company-policy-v1",
    revision: "initial",
    builtAt: "2026-11-01",
    history: {},
    risks: [],
  });
  rows[54] = ["Test owner", null, null, null, null, null, 0.875];
  rows[76] = [1, "Sales owner", 123456, null, 1, "Profit owner", 78900];
  let calls = 0;
  global.fetch = async (input) => {
    const url = String(input);
    calls++;
    assert.ok(url.includes("/values:batchGet?"));
    const query = new URL(url).searchParams;
    assert.equal(query.get("valueRenderOption"), "UNFORMATTED_VALUE");
    assert.equal(query.getAll("ranges").length, 8);
    assert.ok(
      query.getAll("ranges").every((r) => r.startsWith("'01_经营目标'!")),
    );
    return Response.json({
      valueRanges: TARGET_RANGES.map((range) => {
        const [start, end] = range.split(":");
        const a = Number(start.match(/\d+/)![0]) - 1,
          b = Number(end.match(/\d+/)![0]);
        return {
          values: rows
            .slice(a, b)
            .map((r) => (start.startsWith("T") ? [r[19]] : r)),
        };
      }),
    });
  };
  try {
    const s = await getSnapshot(true);
    assert.equal(s.targets["公司"].standardProgress, 0.4321);
    assert.equal(s.targets["公司"].sales, 156);
    assert.equal(calls, 1);
    assert.equal(s.rankings?.completion[0].value, 0.875);
    assert.equal(s.rankings?.sales[0].value, 123456);
    assert.equal(s.actualHistory["公司"]["2026-11-08"].sales, 156);
    s.targets["公司"].sales = 160;
    await persistDaily(s);
    const saved = await readStore<Snapshot["actualHistory"]>(
      "actual-daily-v2.json",
    );
    assert.equal(saved!["公司"]["2026-11-08"].sales, 160);
    assert.equal(Object.keys(saved!["公司"]).length, 2);
    await getSnapshot();
    assert.equal(calls, 1);
    const persisted = JSON.parse(
      await fs.readFile(path.join(dir, "actual-daily-v2.json"), "utf8"),
    );
    assert.equal(persisted["公司"]["2026-11-08"].sales, 160);
    const { POST } = await import("../app/api/internal/sync/route");
    process.env.SYNC_TOKEN = "test-only-scheduled-sync-token-32-characters";
    const rejected = await POST(new Request("http://localhost/api/internal/sync", { method: "POST" }));
    assert.equal(rejected.status, 401);
    const synced = await POST(new Request("http://localhost/api/internal/sync", {
      method: "POST", headers: { authorization: `Bearer ${process.env.SYNC_TOKEN}` },
    }));
    assert.equal(synced.status, 200);
    const status = await readStore<{ ok: boolean; cutoff: string }>("sync-status.json");
    assert.equal(status?.ok, true);
    assert.equal(status?.cutoff, "2026-11-08");
    assert.equal(calls, 1); // Same-process cooldown and queue are reused, not an ERP scan.
  } finally {
    GoogleAuth.prototype.getAccessToken = originalToken;
    global.fetch = originalFetch;
    assert.ok(
      path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    await fs.rm(dir, { recursive: true, force: true });
  }
});
