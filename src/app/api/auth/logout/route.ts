import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request refused." } }, { status: 403 });
  }

  const response = NextResponse.json({ data: { authenticated: false } });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  response.headers.set("cache-control", "no-store");
  return response;
}
