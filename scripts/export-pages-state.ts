import fs from "node:fs/promises";
import path from "node:path";
import { publicData } from "../lib/public-data";
async function main() {
  const source = path.resolve(process.env.CACHE_DIR || ".private");
  const dest = path.resolve(process.env.PAGES_STATE_DIR || "pages-seed");
  if (source === dest) throw Error("Use a separate public state directory");
  const read = async (name: string) => JSON.parse(await fs.readFile(path.join(source, name), "utf8"));
  const snapshot = publicData(await read("snapshot-v2.json"));
  const history = await read("history-v2.json");
  const status = await read("pages-sync-status.json").catch(() => ({ok: false, attemptedAt: null}));
  const files: Record<string, unknown> = {
    "snapshot-v2.json": snapshot,
    "history-v2.json": { policy: history.policy, revision: history.revision, builtAt: history.builtAt,
      history: snapshot.history,
      risks: history.risks.map(({scope, severity, issue, evidence, action, amount}: typeof snapshot.risks[number]) => ({scope, severity, issue, evidence, action, amount})),
    },
    "actual-daily-v2.json": snapshot.actualHistory,
    "pages-sync-status.json": {ok: status.ok === true, attemptedAt: status.attemptedAt, fetchedAt: status.fetchedAt},
    ...(snapshot.backfill ? {"actual-backfill-v1.json": snapshot.backfill} : {}),
  };
  await fs.mkdir(dest, {recursive: true});
  for (const [name, value] of Object.entries(files)) await fs.writeFile(path.join(dest, name), JSON.stringify(value));
  console.log(`Exported ${Object.keys(files).length} allowlisted aggregate state files; no raw ERP, credentials or owner details.`);
}
main().catch((e) => {console.error(e.message); process.exitCode = 1;});
