import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["jszip", "postal-mime"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
