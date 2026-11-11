import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { publicData } from "../lib/public-data";
const root = process.cwd(), stage = path.join(root, ".pages-build");
async function main() {
  // Isolated staging leaves local API/auth and normal development intact.
  if (path.dirname(stage) !== root || path.basename(stage) !== ".pages-build") throw Error("Unsafe staging path");
  await fs.rm(stage, {recursive: true, force: true});
  await fs.mkdir(stage, {recursive: true});
  for (const name of ["app", "components", "lib"])
    await fs.cp(path.join(root, name), path.join(stage, name), {recursive: true,
      filter: (src) => src !== path.join(root, "app", "api")});
  for (const name of ["package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "next-env.d.ts"])
    await fs.copyFile(path.join(root, name), path.join(stage, name));
  // Auth/proxy, credentials, scripts, raw data and .env files are never staged.
  await fs.mkdir(path.join(stage, "public"));
  const state = path.resolve(process.env.CACHE_DIR || ".private");
  const snapshot = JSON.parse(await fs.readFile(path.join(state, "snapshot-v2.json"), "utf8"));
  const status = await fs.readFile(path.join(state, "pages-sync-status.json"), "utf8").then(JSON.parse).catch(() => null);
  const data = publicData({...snapshot, stale: status?.ok === false || snapshot.stale});
  await fs.writeFile(path.join(stage, "public", "dashboard.json"), JSON.stringify(data));
  const basePath = process.env.PAGES_BASE_PATH || "";
  if (basePath && !/^\/[A-Za-z0-9_.-]+$/.test(basePath)) throw Error("Invalid Pages base path");
  const built = spawnSync(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build", stage], {
    stdio: "inherit", env: {...process.env, PAGES_STATIC: "true", NEXT_PUBLIC_STATIC_EXPORT: "true", NEXT_PUBLIC_BASE_PATH: basePath, NEXT_TELEMETRY_DISABLED: "1"},
  });
  if (built.status !== 0) throw Error("Static build failed");
  await fs.writeFile(path.join(stage, "out", ".nojekyll"), "");
  console.log("Static site ready in .pages-build/out; no server routes included.");
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
