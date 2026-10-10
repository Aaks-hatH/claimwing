import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "ClaimWing — evidence for delayed flights and damaged bags", template: "%s · ClaimWing" },
  description:
    "Track your flight live, photograph your bag before and after, and export one evidence packet for your compensation claim. Documentation support, not legal advice.",
  applicationName: "ClaimWing",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edeff1" },
    { media: "(prefers-color-scheme: dark)", color: "#12171c" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
