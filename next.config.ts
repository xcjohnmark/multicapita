import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app renders live quotes, balances and execution state per request.
  // Caching-by-default would risk showing a stale financial figure, so it is off.
  cacheComponents: false,
  partialPrefetching: false,
  // Native SQLite driver must stay outside the bundler.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
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
