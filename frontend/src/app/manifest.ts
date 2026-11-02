import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LedgerSync Expense Manager",
    short_name: "LedgerSync",
    description: "Personal budgets, savings goals, and shared expenses",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#4f806b",
    theme_color: "#4f806b",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
