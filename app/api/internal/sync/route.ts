import { syncAuthorized, denied } from "@/lib/auth";
import { getSnapshot } from "@/lib/data";
import { writeStore } from "@/lib/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!syncAuthorized(req)) return denied();
  const attemptedAt = new Date().toISOString();
  try {
    // Same process and refresh queue as browser refresh; no second writer.
    const snapshot = await getSnapshot(true);
    if (snapshot.stale) throw Error(snapshot.error || "同步失败，保留上次结果");
    const status = { ok: true, attemptedAt, fetchedAt: snapshot.fetchedAt, cutoff: snapshot.cutoff };
    await writeStore("sync-status.json", status);
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = { ok: false, attemptedAt, error: error instanceof Error ? error.message : "同步失败" };
    await writeStore("sync-status.json", status);
    return Response.json(status, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
