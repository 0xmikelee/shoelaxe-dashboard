import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { zhHant } from "@/lib/i18n/zh-Hant";

import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Geist Mono, not JetBrains Mono: the .pen variables panel still names JetBrains but the export
// emits Geist Mono, and the export is what the screens actually render. See docs/DESIGN-TOKENS.md.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // From the dictionary, not a second copy of it: the two had already drifted (「Shoelaxe 管理後台」
  // here against 「Shoelaxe 價格管理後台」 in zh-Hant.ts) before either had ever been reviewed.
  title: {
    default: zhHant.app.title,
    template: `%s · ${zhHant.app.name}`,
  },
  description: zhHant.app.description,
  // Internal tool behind a sign-in allow-list; there is nothing here to index.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-Hant-HK"
      // next-themes writes the theme class onto <html> before hydration, so the server markup and
      // the first client render legitimately disagree on this element.
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
