"use client";

import { ThemeProvider } from "next-themes";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      {/* Every framer-motion animation follows the system "reduce motion" setting. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
      <Toaster position="top-center" richColors closeButton toastOptions={{ className: "font-sans" }} />
    </ThemeProvider>
  );
}
