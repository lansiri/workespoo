import { SiteShell } from "@/components/site/SiteShell";

/** Plain test pages for the builders. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell audience="public">{children}</SiteShell>;
}
