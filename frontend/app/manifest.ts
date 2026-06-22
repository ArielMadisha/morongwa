import type { MetadataRoute } from "next";

/**
 * Web App Manifest — use SVG with sizes "any" so Chrome does not warn about
 * mismatched PNG dimensions (see layout.tsx icons for page metadata).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Qwertymates",
    short_name: "Qwertymates",
    description:
      "The digital home for doers, sellers & creators — marketplace, TV, music, and wallet.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "browser"],
    orientation: "portrait-primary",
    background_color: "#f0f9ff",
    theme_color: "#0284c7",
    categories: ["social", "shopping", "entertainment"],
    icons: [
      {
        src: "/qwertymates-logo-icon.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: "/pwa-192.png",
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "/pwa-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
    ],
  };
}
