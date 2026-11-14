import { SiteShell } from "@/components/site/SiteShell";

/** The owner's original page keeps the same frame it always had. */
export default function ComingSoonLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell audience="public">{children}</SiteShell>;
}
