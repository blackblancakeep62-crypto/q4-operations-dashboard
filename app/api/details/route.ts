import { authorized, denied } from "@/lib/auth";
import { getDetails } from "@/lib/data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!authorized(req)) return denied();
  try {
    return Response.json(await getDetails(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "明细不可用" },
      { status: 503 },
    );
  }
}
