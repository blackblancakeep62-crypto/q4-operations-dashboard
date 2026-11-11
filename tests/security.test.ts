import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { authorized, sameOrigin } from "../lib/auth";
test("same-origin refresh accepts browser host after Next URL normalization", () => {
  assert.equal(
    sameOrigin(
      new Request("http://localhost:3000/api/dashboard", {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    ),
    true,
  );
  assert.equal(
    sameOrigin(
      new Request("http://localhost:3000/api/dashboard", {
        headers: { host: "127.0.0.1:3000", origin: "https://attacker.example" },
      }),
    ),
    false,
  );
});
test("production fails closed, correct credentials required, foreign origins rejected", () => {
  const env = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.DASHBOARD_LOCAL_ONLY = "true";
    delete process.env.DASHBOARD_PASSWORD;
    assert.equal(authorized(new Request("http://127.0.0.1:3000")), false);
    process.env.DASHBOARD_USERNAME = "tester";
    process.env.DASHBOARD_PASSWORD = "a-long-test-password-only";
    const req = new Request("http://localhost:3000", {
      headers: {
        authorization:
          "Basic " +
          Buffer.from("tester:a-long-test-password-only").toString("base64"),
      },
    });
    assert.equal(authorized(req), true);
    assert.equal(
      authorized(
        new Request("http://localhost:3000", {
          headers: { authorization: "Basic bad" },
        }),
      ),
      false,
    );
    assert.equal(
      sameOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "https://attacker.example" },
        }),
      ),
      false,
    );
  } finally {
    process.env = env;
  }
});
test("no Google authorization fails; last snapshot retained without changing timestamp", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "q4-test-"));
  process.env.CACHE_DIR = dir;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_REFRESH_TOKEN;
  const { getSnapshot, saveSnapshot } = await import("../lib/data");
  await assert.rejects(() => getSnapshot(true), /未配置服务端 Google 授权/);
  await saveSnapshot({
    fetchedAt: "2026-01-01T00:00:00Z",
    cutoff: "2026-11-08",
    targets: {},
  } as never);
  const result = await getSnapshot(true);
  assert.equal(result.stale, true);
  assert.equal(result.fetchedAt, "2026-01-01T00:00:00Z");
  await fs.rm(dir, { recursive: true, force: true });
});
