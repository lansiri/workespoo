import { SiteShell } from "@/components/site/SiteShell";

/** The person's pages: start of the interview, the card, the matches. */
export default function TalentLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell audience="talent">{children}</SiteShell>;
}
