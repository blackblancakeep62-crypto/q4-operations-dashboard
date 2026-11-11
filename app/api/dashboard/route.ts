import { authorized, denied, sameOrigin } from "@/lib/auth";
import { getSnapshot } from "@/lib/data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function respond(req: Request, refresh = false) {
  if (!authorized(req)) return denied();
  if (refresh && !sameOrigin(req))
    return Response.json(
      { error: "刷新请求来源不匹配，请使用配置的内部网址访问。" },
      { status: 403 },
    );
  try {
    return Response.json(await getSnapshot(refresh), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "数据暂不可用" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const GET = (req: Request) => respond(req);
export const POST = (req: Request) => respond(req, true);
