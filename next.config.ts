import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output gives a small self-contained server for Docker / Fly.io / any Node host.
  output: "standalone",
  // These packages use native code or Node-only APIs; keep them out of the server bundle.
  serverExternalPackages: ["mongoose", "sharp", "@react-pdf/renderer", "exif-reader"],
  // Reference data (airports, airlines, replays) is read from disk at runtime.
  outputFileTracingIncludes: {
    "/**": ["./data/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // The service worker must always be revalidated so updates reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Camera and location are used by the baggage capture flow on this origin only.
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
