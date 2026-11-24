import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";

// IBM Plex Sans for reading and UI; Helvetica Neue (system font on Apple devices) for headings,
// with Plex as its fallback; Noto Sans Bengali for Bangla.
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--f-plex" });
const bangla = Noto_Sans_Bengali({ subsets: ["bengali"], weight: ["400", "500", "600"], variable: "--f-bn" });

export const metadata: Metadata = {
  title: "Leave Policy Assistant",
  description: "Answers questions about a sample company leave policy, in English or Bangla, with the section each answer comes from.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f8fafc",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} ${bangla.variable}`}>
      <body>{children}</body>
    </html>
  );
}
