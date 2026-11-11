import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
function equalSecret(value: string, expected: string | undefined) {
  return !!expected && expected.length >= 32 && timingSafeEqual(
    createHash("sha256").update(value).digest(),
    createHash("sha256").update(expected).digest(),
  );
}
export function syncAuthorized(req: Request) {
  return new URL(req.url).pathname === "/api/internal/sync" &&
    req.method === "POST" &&
    equalSecret(req.headers.get("authorization") ?? "", process.env.SYNC_TOKEN ? `Bearer ${process.env.SYNC_TOKEN}` : undefined) &&
    (process.env.SYNC_TOKEN?.length ?? 0) >= 32;
}
export function authorized(req: Request) {
  if (process.env.DASHBOARD_AUTH_MODE === "gateway") {
    if (!equalSecret(req.headers.get("x-q4-gateway") ?? "", process.env.GATEWAY_SECRET)) return false;
    const email = req.headers.get("x-q4-email")?.trim().toLowerCase();
    if (!email || !process.env.DASHBOARD_MEMBERS_FILE) return false;
    try {
      const members = readFileSync(process.env.DASHBOARD_MEMBERS_FILE, "utf8")
        .split(/\r?\n/).map((s) => s.trim().toLowerCase())
        .filter((s) => s && !s.startsWith("#"));
      return members.includes(email);
    } catch { return false; }
  }
  const local =
    process.env.NODE_ENV !== "production" &&
    process.env.DASHBOARD_LOCAL_ONLY === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(req.url).hostname);
  if (local) return true;
  const user = process.env.DASHBOARD_USERNAME,
    password = process.env.DASHBOARD_PASSWORD;
  if (!user || !password || password.length < 20) return false;
  const h = req.headers.get("authorization") ?? "";
  if (!h.startsWith("Basic ")) return false;
  const supplied = Buffer.from(h.slice(6), "base64").toString();
  return timingSafeEqual(
    createHash("sha256").update(supplied).digest(),
    createHash("sha256").update(`${user}:${password}`).digest(),
  );
}
export function denied() {
  return new Response("内部经营看板：需要授权。请配置管理账号或联系管理员。", {
    status: 401,
    headers: {
      ...(process.env.DASHBOARD_AUTH_MODE === "gateway" ? {} : {
        "WWW-Authenticate": 'Basic realm="Q4 internal dashboard", charset="UTF-8"',
      }),
      "Cache-Control": "no-store",
    },
  });
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  if (process.env.APP_ORIGIN) return origin === process.env.APP_ORIGIN;
  const url = new URL(req.url);
  const host = req.headers.get("host") ?? url.host;
  return origin === `${url.protocol}//${host}`;
}
