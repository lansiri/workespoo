import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n/client";
import { getUiLang } from "@/lib/i18n/server";
import { SiteFooter } from "@/components/site/SiteFooter";
import { brandFont } from "@/components/brand/fonts";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WorkEspoo",
  description: "Prototype for Junction 2026. Not an official City of Espoo service.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getUiLang();
  return (
    <html
      lang={lang}
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
        brandFont.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider lang={lang}>
          <TooltipProvider>
            <div className="flex-1">{children}</div>
            <SiteFooter lang={lang} />
          </TooltipProvider>
        </I18nProvider>
        <Toaster />
      </body>
    </html>
  );
}
