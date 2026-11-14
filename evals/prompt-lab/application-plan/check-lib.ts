/** Shared helpers for the application-* checks. */
import type { Lang } from "./data";

export function detectLang(text: string): Lang | "?" {
  const t = text.toLowerCase();
  const sv = (t.match(/\b(du|och|har|hur|vad|berätta|det|att|på|med|ett|en|som|i|av|för|när|vilka|gjorde)\b/g) ?? []).length + (/å/.test(t) ? 2 : 0);
  const fi = (t.match(/\b(kerro|miten|mitä|sinä|olet|oletko|jossa|tai|ja|kun|työssä|teit|itse|millainen|mikä|kuvaile|esimerkki|tilanteesta)\b/g) ?? []).length + (/\w+(ssa|ssä|lla|llä|sta|stä|ksi)\b/.test(t) ? 2 : 0);
  const en = (t.match(/\b(you|the|your|what|how|tell|me|about|did|a|in|of|and|to|with|when|time|describe)\b/g) ?? []).length;
  const best = Math.max(sv, fi, en);
  if (best === 0) return "?";
  return best === en ? "en" : best === fi ? "fi" : "sv";
}

export function sentenceCount(text: string): number {
  return (text.match(/[.?!](\s|$)/g) ?? []).length || 1;
}
