"use client";

import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import type { UiLang } from "@/contracts";
import {
  DEFAULT_UI_LANG,
  UI_LANGS,
  UI_LANG_NAMES,
  pick,
  uiLangCookieString,
  type Messages,
} from "./index";

function writeUiLangCookie(lang: UiLang): void {
  document.cookie = uiLangCookieString(lang);
}

const I18nContext = createContext<UiLang>(DEFAULT_UI_LANG);

export function I18nProvider(props: { lang: UiLang; children: React.ReactNode }): React.JSX.Element {
  return <I18nContext.Provider value={props.lang}>{props.children}</I18nContext.Provider>;
}

export function useUiLang(): UiLang {
  return useContext(I18nContext);
}

export function useMessages<T extends Record<string, string>>(messages: Messages<T>): T {
  return pick(messages, useUiLang());
}

export function LanguageSwitcher(): React.JSX.Element {
  const current = useUiLang();
  const router = useRouter();

  function choose(lang: UiLang) {
    if (lang === current) return;
    writeUiLangCookie(lang);
    router.refresh();
  }

  return (
    <div data-testid="language-switcher" role="group" aria-label="Language" className="language-switcher">
      {UI_LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          data-testid={`lang-${lang}`}
          aria-current={lang === current ? "true" : undefined}
          aria-pressed={lang === current}
          className="language-switcher-option"
          style={{
            marginInlineStart: "0.25rem",
            padding: "0.125rem 0.5rem",
            fontWeight: lang === current ? 700 : 400,
            textDecoration: lang === current ? "underline" : "none",
            cursor: "pointer",
          }}
          onClick={() => choose(lang)}
        >
          {UI_LANG_NAMES[lang]}
        </button>
      ))}
    </div>
  );
}
