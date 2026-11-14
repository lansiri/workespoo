import { NextResponse } from "next/server";
import { isUiLang } from "@/lib/i18n";
import { setUiLangCookie } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Only a path on this site: starts with one slash, no scheme, no backslash. */
function safeBack(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

/**
 * Sets the interface language and goes back to the page the person was on. The header's
 * language links point here, so they work without JavaScript; with it, the shell switches in
 * place and never calls this route.
 */
export async function GET(request: Request, ctx: RouteContext<"/lang/[code]">) {
  const { code } = await ctx.params;
  const url = new URL(request.url);
  const back = safeBack(url.searchParams.get("back"));
  if (isUiLang(code)) await setUiLangCookie(code);
  return NextResponse.redirect(new URL(back, url.origin), 303);
}
