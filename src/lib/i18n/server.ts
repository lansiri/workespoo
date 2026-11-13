import { cookies, headers } from "next/headers";
import type { UiLang } from "@/contracts";
import {
  DEFAULT_UI_LANG,
  UI_LANG_COOKIE,
  UI_LANG_COOKIE_MAX_AGE,
  isUiLang,
  matchAcceptLanguage,
} from "./index";

export { UI_LANG_COOKIE };

/** Cookie if it holds a supported language, else Accept-Language (fi, sv, en), else "en". */
export async function getUiLang(): Promise<UiLang> {
  const fromCookie = (await cookies()).get(UI_LANG_COOKIE)?.value;
  if (isUiLang(fromCookie)) return fromCookie;
  const accept = (await headers()).get("accept-language");
  return matchAcceptLanguage(accept) ?? DEFAULT_UI_LANG;
}

/** For a server action or route handler. */
export async function setUiLangCookie(lang: UiLang): Promise<void> {
  (await cookies()).set(UI_LANG_COOKIE, lang, {
    path: "/",
    maxAge: UI_LANG_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}
