import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { privateDir } from "./sheets";
import { SCOPES } from "./config";
import type { Snapshot, ActualHistory } from "./model";
export async function readStore<T>(name: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(privateDir, name), "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}
export async function writeStore(name: string, value: unknown) {
  await fs.mkdir(privateDir, { recursive: true });
  const file = path.join(privateDir, name),
    temp = file + "." + randomUUID() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(value));
  await fs.rename(temp, file);
}
let queue: Promise<unknown> = Promise.resolve();
export function persistDaily(s: Snapshot): Promise<ActualHistory> {
  const job = queue.then(async () => {
    const all = (await readStore<ActualHistory>("actual-daily-v2.json")) ?? {};
    for (const g of SCOPES) {
      if (s.blocked.includes(g)) continue;
      all[g] ??= {};
      all[g]["2026-10-31"] = {
        sales: s.targets[g].october,
        margin: s.targets[g].margin,
        historical: 0,
        capturedAt: s.fetchedAt,
        source: "financial-anchor",
      };
      all[g][s.cutoff] = {
        sales: s.targets[g].sales,
        margin: s.targets[g].margin,
        historical: s.targets[g].historical,
        capturedAt: s.fetchedAt,
        source: "target",
      };
    }
    await writeStore("actual-daily-v2.json", all);
    return all;
  });
  queue = job.catch(() => {});
  return job;
}
