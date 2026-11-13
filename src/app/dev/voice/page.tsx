import VoiceDevClient from "./VoiceDevClient";
import { voiceDevMessages } from "@/features/voice/messages";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function VoiceDevPage() {
  const m = pick(voiceDevMessages, await getUiLang());
  return <VoiceDevClient m={m} />;
}
