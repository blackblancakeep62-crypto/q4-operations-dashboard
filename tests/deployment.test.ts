import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { authorized, syncAuthorized } from "../lib/auth";

test("gateway fails closed, rejects forged identity and immediately revokes removed members", () => {
  const env = { ...process.env };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "q4-members-"));
  const file = path.join(dir, "members.txt");
  const secret = "test-only-gateway-secret-32-characters";
  const request = (email: string, key = secret) => new Request("https://q4.example.test/api/dashboard", {
    headers: { "x-q4-gateway": key, "x-q4-email": email },
  });
  try {
    Object.assign(process.env, { DASHBOARD_AUTH_MODE: "gateway", GATEWAY_SECRET: secret, DASHBOARD_MEMBERS_FILE: file });
    assert.equal(authorized(request("member@example.test")), false);
    fs.writeFileSync(file, "member@example.test\n");
    assert.equal(authorized(request("MEMBER@example.test")), true);
    assert.equal(authorized(request("outsider@example.test")), false);
    assert.equal(authorized(request("member@example.test", "forged")), false);
    assert.equal(authorized(new Request("http://127.0.0.1:3000")), false);
    fs.writeFileSync(file, "");
    assert.equal(authorized(request("member@example.test")), false);
    delete process.env.GATEWAY_SECRET;
    assert.equal(authorized(request("member@example.test")), false);
  } finally {
    process.env = env;
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
});

test("sync credential grants only POST to the internal sync endpoint", () => {
  const env = { ...process.env };
  try {
    process.env.SYNC_TOKEN = "test-only-sync-token-with-32-characters";
    const request = (url: string, method = "POST", token = process.env.SYNC_TOKEN) => new Request(url, {
      method, headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(syncAuthorized(request("http://localhost/api/internal/sync")), true);
    assert.equal(syncAuthorized(request("http://localhost/api/internal/sync", "GET")), false);
    assert.equal(syncAuthorized(request("http://localhost/api/dashboard")), false);
    assert.equal(syncAuthorized(request("http://localhost/api/internal/sync", "POST", "wrong")), false);
    delete process.env.SYNC_TOKEN;
    assert.equal(syncAuthorized(request("http://localhost/api/internal/sync")), false);
  } finally { process.env = env; }
});
