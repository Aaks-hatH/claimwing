import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { MotionSystem } from "@/components/ui/motion-system";

export const metadata: Metadata = {
  title: { default: "Vola: evidence for delayed flights and damaged bags", template: "%s · Vola" },
  description:
    "Track your flight live, photograph your bag before and after, and export one evidence packet for your compensation claim. Documentation support, not legal advice.",
  applicationName: "Vola",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Providers>
          <MotionSystem />
          {children}
        </Providers>
      </body>
    </html>
  );
}
