import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app renders live quotes, balances and execution state per request.
  // Caching-by-default would risk showing a stale financial figure, so it is off.
  cacheComponents: false,
  partialPrefetching: false,
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
