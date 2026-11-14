import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app renders live quotes, balances and execution state per request.
  // Caching-by-default would risk showing a stale financial figure, so it is off.
  cacheComponents: false,
  partialPrefetching: false,
  // Reown's Base Account connector pulls @base-org/account, whose Node build imports the Coinbase
  // server SDK and its optional x402 payment packages. Capita never calls them; keeping them out of
  // the server bundle stops the build from resolving those optional imports.
  serverExternalPackages: ["@base-org/account", "@coinbase/cdp-sdk"],
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
