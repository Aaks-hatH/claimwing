import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { MotionSystem } from "@/components/ui/motion-system";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";

export const metadata: Metadata = {
  title: { default: "Vola: evidence for delayed flights and damaged bags", template: "%s · Vola" },
  description:
    "Track your flight live, photograph your bag before and after, and export one evidence packet for your compensation claim. Documentation support, not legal advice.",
  applicationName: "Vola",
  appleWebApp: { capable: true, title: "Vola", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#070F26",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Providers>
          <MotionSystem />
          <RegisterServiceWorker />
          {children}
        </Providers>
      </body>
    </html>
  );
}
