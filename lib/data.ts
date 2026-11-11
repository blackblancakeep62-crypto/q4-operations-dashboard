import fs from "node:fs/promises";
import path from "node:path";
import {
  buildSnapshot,
  differs,
  type Snapshot,
  type Raw,
  type Aggregate,
  type Risk,
  type BackfillReport,
} from "./model";
import { sheetNames, thresholds, SCOPES } from "./config";
import { readTargets, readWorkbook, privateDir } from "./sheets";
import { readStore, writeStore, persistDaily } from "./store";
import { aggregateHistory, aggregateDetails, ERP_POLICY_VERSION } from "./erp";
type HistoryCache = {
  policy: string;
  revision: string;
  builtAt: string;
  history: Aggregate;
  risks: Risk[];
};
let memory: Snapshot | undefined,
  pending: Promise<Snapshot> | undefined,
  lastAttempt = 0,
  lastError = "";
export async function saveSnapshot(s: Snapshot) {
  await writeStore("snapshot-v2.json", s);
  memory = s;
}
async function localRaw(names: string[]): Promise<Raw> {
  const raw: Raw = {};
  for (const n of names)
    raw[n] = JSON.parse(
      await fs.readFile(path.join(privateDir, "raw", n + ".json"), "utf8"),
    );
  return raw;
}
export async function getHistory(rebuild = false, preferLocal = false) {
  const revision = process.env.HISTORY_SOURCE_REVISION ?? "initial";
  const cached = await readStore<HistoryCache>("history-v2.json");
  if (
    !rebuild &&
    cached?.policy === ERP_POLICY_VERSION &&
    cached.revision === revision
  )
    return cached;
  const raw = preferLocal
    ? await localRaw([sheetNames.country, sheetNames.parent])
    : await readWorkbook("history");
  const result = {
    ...aggregateHistory(raw),
    policy: ERP_POLICY_VERSION,
    revision,
    builtAt: new Date().toISOString(),
  };
  await writeStore("history-v2.json", result);
  return result;
}
async function compose(
  rows: Raw[string],
  at: string,
  source: string,
  preferLocal = false,
) {
  let history: HistoryCache | undefined, warning: Risk | undefined;
  try {
    history = await getHistory(false, preferLocal);
  } catch (e) {
    history = await readStore<HistoryCache>("history-v2.json");
    warning = {
      scope: "公司",
      severity: "中",
      issue: "历史缓存读取或更新失败",
      evidence: e instanceof Error ? e.message : "历史暂不可用",
      action: "核查历史数据授权；当前经营指标与每日快照不受影响",
    };
  }
  const s = buildSnapshot(
    { [sheetNames.target]: rows },
    at,
    source,
    history?.history ?? {},
    {},
    memory?.targets,
  );
  s.actualHistory = await persistDaily(s);
  s.backfill = await readStore<BackfillReport>("actual-backfill-v1.json");
  s.risks.push(...(history?.risks ?? []));
  if (warning) s.risks.push(warning);
  await saveSnapshot(s);
  return s;
}
async function initial() {
  if (memory) return memory;
  const existing = await readStore<Snapshot>("snapshot-v2.json");
  if (existing?.version === 2) {
    memory = existing;
    return existing;
  }
  try {
    const imported =
      (await readStore<{ fetchedAt: string; source: string }>(
        "target-read.json",
      )) ??
      (await readStore<{ fetchedAt: string; source: string }>("import.json"));
    if (!imported) return undefined;
    const raw = await localRaw([sheetNames.target]);
    return await compose(
      raw[sheetNames.target],
      imported.fetchedAt,
      imported.source,
      true,
    );
  } catch {
    return undefined;
  }
}
export async function getSnapshot(force = false): Promise<Snapshot> {
  const previous = await initial();
  if (
    !force &&
    previous?.source.startsWith("Google Sheets API") &&
    Date.now() - Date.parse(previous.fetchedAt) < thresholds.cacheSeconds * 1000
  )
    return previous;
  if (pending) return pending;
  if (previous && Date.now() - lastAttempt < 60000)
    return {
      ...previous,
      stale: lastError ? true : previous.stale,
      error: lastError || previous.error,
    };
  lastAttempt = Date.now();
  pending = (async () => {
    try {
      const rows = await readTargets();
      lastError = "";
      return await compose(
        rows,
        new Date().toISOString(),
        "Google Sheets API · 只读",
      );
    } catch (e) {
      lastError = e instanceof Error ? e.message : "同步失败";
      if (previous) return { ...previous, stale: true, error: lastError };
      throw e;
    } finally {
      pending = undefined;
    }
  })();
  return pending;
}
type Details = ReturnType<typeof aggregateDetails> & {
  fetchedAt: string;
  cutoff: string;
  source: string;
  stale?: boolean;
  error?: string;
};
let detailPending: Promise<Details> | undefined;
export async function getDetails(): Promise<Details> {
  if (detailPending) return detailPending;
  detailPending = (async () => {
    const s = await getSnapshot();
    const cached = await readStore<Details>("details-v2.json");
    if (
      cached?.cutoff === s.cutoff &&
      Date.now() - Date.parse(cached.fetchedAt) < 900000
    )
      return cached;
    try {
      let raw: Raw,
        source = "Google Sheets API";
      let at = new Date().toISOString();
      try {
        raw = await readWorkbook("details");
      } catch (e) {
        if (cached)
          return {
            ...cached,
            stale: true,
            error: e instanceof Error ? e.message : "读取失败",
          };
        const manifest = await readStore<{ fetchedAt: string }>("import.json");
        if (!manifest) throw e;
        raw = await localRaw([sheetNames.october, sheetNames.erp]);
        source = "本地真实导入快照";
        at = manifest.fetchedAt;
      }
      const result: Details = {
        ...aggregateDetails(raw, s.cutoff),
        fetchedAt: at,
        cutoff: s.cutoff,
        source,
        stale: source !== "Google Sheets API",
      };
      for (const g of SCOPES) {
        const month = Object.entries(result.daily[g] ?? {})
          .filter(([d]) => d.startsWith("2026-11"))
          .reduce((a, [, v]) => a + v.sales, 0);
        if (differs(month, s.targets[g].november))
          result.risks.push({
            scope: g,
            severity: "中",
            issue: "11月明细与目标Q列存在差异",
            amount: month - s.targets[g].november,
            evidence: `明细 ${month.toFixed(2)}；目标表 ${s.targets[g].november.toFixed(2)}；截止 ${s.cutoff}`,
            action: "核对完整业务日期和结算时点；不覆盖官方经营指标",
          });
      }
      await writeStore("details-v2.json", result);
      return result;
    } catch (e) {
      if (cached)
        return {
          ...cached,
          stale: true,
          error: e instanceof Error ? e.message : "明细读取失败",
        };
      throw e;
    }
  })();
  try {
    return await detailPending;
  } finally {
    detailPending = undefined;
  }
}
