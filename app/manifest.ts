import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Vola: evidence for delayed flights and damaged bags",
    short_name: "Vola",
    description:
      "Track your flight live, photograph your bag before and after, and export one evidence packet for your claim. Documentation support, not legal advice.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070F26",
    theme_color: "#070F26",
    categories: ["travel", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "My trips", short_name: "Trips", url: "/app", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Demo Center", short_name: "Demo", url: "/demo", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
