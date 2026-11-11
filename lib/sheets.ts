import { GoogleAuth, OAuth2Client } from "google-auth-library";
import fs from "node:fs/promises";
import path from "node:path";
import { sheetNames, thresholds } from "./config";
import type { Raw, Rows } from "./model";
import { readGasTargets } from "./gas";
export const privateDir = path.resolve(
  /* turbopackIgnore: true */ process.env.CACHE_DIR || ".private",
);
const id = process.env.GOOGLE_SPREADSHEET_ID;
async function token() {
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    const auth = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return (await auth.getAccessToken()).token;
  }
  if (
    !process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    !process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  )
    throw Error(
      "未配置服务端 Google 授权。现有 Codex 连接可读取，但不会把连接凭据转移给网页。请按 README 配置只读服务账号或 OAuth。",
    );
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    ...(process.env.GOOGLE_SERVICE_ACCOUNT_JSON
      ? { credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) }
      : {}),
  });
  return auth.getAccessToken();
}
async function client() {
  const access = await token();
  if (!id) throw Error("未配置 GOOGLE_SPREADSHEET_ID");
  async function get(url: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}${url}`,
        {
          headers: { Authorization: `Bearer ${access}` },
          cache: "no-store",
          signal: AbortSignal.timeout(90000),
        },
      );
      if (r.ok) return r.json();
      if ((r.status === 429 || r.status >= 500) && attempt < 4) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * 2 ** attempt + Math.random() * 500),
        );
        continue;
      }
      throw Error(
        `Google Sheets读取失败（HTTP ${r.status}）。请检查表格共享权限、API启用及配额。`,
      );
    }
    throw Error("Google Sheets重试失败");
  }
  return get;
}
export const TARGET_RANGES = [
  "T11:T12",
  "A13:T16",
  "A21:T23",
  "A29:T31",
  "A37:T39",
  "A45:T47",
  "A55:I74",
];
export async function readTargets(): Promise<Rows> {
  const gas = process.env.SHEETS_TRANSPORT === "gas" || !!process.env.GAS_WEB_APP_URL;
  let result;
  if (gas) result = await readGasTargets(TARGET_RANGES);
  else {
  const get = await client();
  const query = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  for (const range of TARGET_RANGES)
    query.append("ranges", `'${sheetNames.target}'!${range}`);
  result = await get("/values:batchGet?" + query);
  }
  const rows: Rows = Array.from({ length: 79 }, () => []);
  for (let i = 0; i < TARGET_RANGES.length; i++) {
    const range = TARGET_RANGES[i],
      match = range.match(/^([A-Z]+)(\d+)/)!;
    const start = Number(match[2]) - 1,
      col = match[1] === "T" ? 19 : 0;
    for (const [offset, row] of (result.valueRanges[i].values ?? []).entries())
      for (let c = 0; c < row.length; c++)
        rows[start + offset][col + c] = row[c];
  }
  return rows;
}
export async function readWorkbook(mode: "history" | "details"): Promise<Raw> {
  const get = await client();
  const meta = await get("?fields=sheets(properties(title,gridProperties))");
  const names =
    mode === "history"
      ? [sheetNames.country, sheetNames.parent]
      : [sheetNames.october, sheetNames.erp];
  const spec: [string, string][] = names.map((n) => [n, n]);
  if (mode === "details" && process.env.DECEMBER_SHEET_NAME)
    spec.push(["ERP_DECEMBER", process.env.DECEMBER_SHEET_NAME]);
  const raw: Raw = {};
  for (const [key, name] of spec) {
    const prop = meta.sheets.find(
      (s: { properties: { title: string } }) => s.properties.title === name,
    )?.properties;
    if (!prop) throw Error(`缺少子表 ${name}`);
    const rows: Rows = [];
    for (let start = 1; start <= prop.gridProperties.rowCount; start += 3000) {
      const end = Math.min(start + 2999, prop.gridProperties.rowCount);
      const range = `'${name.replace(/'/g, "''")}'!A${start}:Q${end}`;
      const response = await get(
        `/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
      );
      const values = response.values ?? [];
      rows.push(
        ...values,
        ...Array.from({ length: end - start + 1 - values.length }, () => []),
      );
    }
    raw[key] = rows;
  }
  return raw;
}
