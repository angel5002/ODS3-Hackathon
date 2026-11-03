import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false, // keeps screenshots taken in development identical to production
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
