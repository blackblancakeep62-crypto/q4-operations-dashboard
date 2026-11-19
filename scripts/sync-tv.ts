import fs from "node:fs/promises";
import path from "node:path";
import { readGasTargets } from "../lib/gas";
import { emptyTv, TV_RANGES, TV_RANGES_V2, tvFromRanges, validateTv } from "../lib/tv";
async function main() {
  const dir = path.resolve(process.env.CACHE_DIR || ".private");
  const file = path.join(dir, "tv-snapshot-v1.json");
  const previous = await fs.readFile(file, "utf8").then(JSON.parse).then(validateTv)
    .catch(() => fs.readFile("pages-seed/tv-snapshot-v1.json", "utf8").then(JSON.parse).then(validateTv).catch(() => emptyTv()));
  let snapshot;
  try {
    try {
      const result = await readGasTargets(TV_RANGES_V2, "readTvV2");
      snapshot = tvFromRanges(result.valueRanges);
    } catch {
      const legacy = await readGasTargets(TV_RANGES, "readTv");
      snapshot = tvFromRanges(legacy.valueRanges);
      console.warn("::warning::GAS readTvV2 unavailable; synchronized legacy TV data without campaign timing.");
    }
  } catch {
    snapshot = {...previous, ok: false, attemptedAt: new Date().toISOString()};
    console.warn("::warning::TV sync failed; last successful TV snapshot retained. Check the deployed GAS readTv action.");
  }
  await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(file + ".tmp", JSON.stringify(snapshot));
  await fs.rename(file + ".tmp", file);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `synced=${snapshot.ok}\n`);
  console.log(`TV synchronized=${snapshot.ok}; last success=${snapshot.fetchedAt || "none"}`);
}
main().catch(() => {console.error("TV snapshot persistence failed."); process.exitCode = 1;});
