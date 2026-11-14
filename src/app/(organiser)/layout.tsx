import { SiteShell } from "@/components/site/SiteShell";

/** The organiser's console. */
export default function OrganiserLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell audience="organiser">{children}</SiteShell>;
}
