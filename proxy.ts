import { NextResponse, type NextRequest } from "next/server";
import { authorized, denied, syncAuthorized } from "./lib/auth";
export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/internal/sync")
    return syncAuthorized(req) ? NextResponse.next() : denied();
  return authorized(req) ? NextResponse.next() : denied();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
