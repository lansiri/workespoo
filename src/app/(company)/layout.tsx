import { SiteShell } from "@/components/site/SiteShell";

/** Pages a company opens from its private link: no navigation, only the logo and the languages. */
export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell audience="company">{children}</SiteShell>;
}
