import type { Rows } from "./model";

export async function readGasTargets(ranges: string[]): Promise<{valueRanges: {values: Rows}[]}> {
  const key = process.env.GAS_SHARED_KEY;
  let url: URL;
  try { url = new URL(process.env.GAS_WEB_APP_URL || ""); } catch { throw Error("未配置有效的 GAS_WEB_APP_URL"); }
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" ||
      !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname) || url.search || url.hash || url.username || url.password)
    throw Error("GAS地址必须是无查询参数的正式 /exec HTTPS 地址");
  if (!key || key.length < 32) throw Error("未配置 GAS_SHARED_KEY（至少32字符）");
  try {
    let response = await fetch(url.toString(), {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action: "readTargets", key}), redirect: "manual",
      signal: AbortSignal.timeout(90000), cache: "no-store",
    });
    // GAS ContentService redirects to a one-time response URL. Never forward the key.
    if (response.status === 302 || response.status === 303) {
      const location = new URL(response.headers.get("location") || "");
      if (location.protocol !== "https:" || location.hostname !== "script.googleusercontent.com" || location.username || location.password)
        throw Error("Unexpected redirect");
      response = await fetch(location.toString(), {method: "GET", redirect: "error", signal: AbortSignal.timeout(90000), cache: "no-store"});
    }
    if (!response.ok) throw Error("HTTP failure");
    const body = await response.text();
    if (body.length > 1000000) throw Error("Response too large");
    const result = JSON.parse(body);
    if (result.ok !== true || result.version !== 1 || !Array.isArray(result.valueRanges) || result.valueRanges.length !== ranges.length)
      throw Error("Invalid GAS response");
    for (let i = 0; i < ranges.length; i++) {
      const match = ranges[i].match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)!;
      const column = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
      const height = Number(match[4]) - Number(match[2]) + 1, width = column(match[3]) - column(match[1]) + 1;
      const entry = result.valueRanges[i];
      if (entry.range !== ranges[i] || !Array.isArray(entry.values) || entry.values.length !== height ||
          entry.values.some((row: unknown) => !Array.isArray(row) || row.length !== width || row.some((cell) =>
            cell !== null && typeof cell !== "string" && !(typeof cell === "number" && Number.isFinite(cell)))))
        throw Error("Invalid range shape");
    }
    return result;
  } catch {
    // HTTP libraries may include URL/body in exceptions. Never propagate those to logs/public data.
    throw Error("GAS读取失败：请检查部署权限、正式版本、共享密钥及脚本属性；保留上次有效数据。");
  }
}
