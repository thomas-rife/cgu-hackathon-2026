import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Load ArcGIS from node_modules on the server instead of bundling it (build memory).
  serverExternalPackages: ["@arcgis/core"],
  outputFileTracingIncludes: { "/api/route": ["./public/ces.geojson"] },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
