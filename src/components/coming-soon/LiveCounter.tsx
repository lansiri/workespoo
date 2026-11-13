"use client";

import { useEffect, useState } from "react";
import { useUiLang } from "@/lib/i18n/client";
import { UI_LANG_LOCALES } from "@/lib/i18n/types";

/**
 * The climbing "applications sent into the void today" number. The server
 * renders `start`, so with JavaScript off the page still shows the number.
 * Honours prefers-reduced-motion by not ticking.
 */
export function LiveCounter({ start }: { start: number }) {
  const lang = useUiLang();
  const [value, setValue] = useState(start);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setValue((v) => v + 1 + Math.floor(Math.random() * 4));
    }, 650);
    return () => window.clearInterval(id);
  }, []);

  const text = new Intl.NumberFormat(UI_LANG_LOCALES[lang]).format(value);
  return (
    <span data-testid="void-counter" style={{ fontVariantNumeric: "tabular-nums" }}>
      {text}
    </span>
  );
}
