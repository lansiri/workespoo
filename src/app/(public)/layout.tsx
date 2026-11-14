import { SiteShell } from "@/components/site/SiteShell";

/** The front page and "How this works". */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell audience="public">{children}</SiteShell>;
}
