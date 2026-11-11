import fs from "node:fs/promises";
import path from "node:path";
// No .env loading in CI: Google authorization comes only from Actions Secrets.
async function main() {
  const { readStore, writeStore } = await import("../lib/store");
  const { getSnapshot } = await import("../lib/data");
  const { privateDir } = await import("../lib/sheets");
  const previous = await readStore("snapshot-v2.json");
  try {
    // Missing history must fail, never silently scan historical/ERP sheets in daily CI.
    const history = await readStore<{policy:string;revision:string}>("history-v2.json");
    if (history?.policy !== "company-policy-v1" || history.revision !== (process.env.HISTORY_SOURCE_REVISION || "initial"))
      throw Error("Valid historical cache required");
    const result = await getSnapshot(true);
    if (result.stale) throw Error("Google Sheets refresh failed");
    await writeStore("pages-sync-status.json", {ok: true, attemptedAt: new Date().toISOString(), fetchedAt: result.fetchedAt});
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, "synced=true\n");
    console.log(`Sync succeeded; business cutoff ${result.cutoff}.`);
  } catch {
    if (!previous) throw Error("No valid snapshot available; deployment stopped.");
    await writeStore("pages-sync-status.json", {ok: false, attemptedAt: new Date().toISOString()});
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, "synced=false\n");
    console.warn("::warning::Google Sheets synchronization failed; last successful snapshot retained. Check repository Secrets and Sheets viewer permission.");
  }
  // State is uploaded only after projection by the dedicated export step.
  if (!(await fs.stat(path.join(privateDir, "snapshot-v2.json"))).isFile()) throw Error("Snapshot missing");
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
