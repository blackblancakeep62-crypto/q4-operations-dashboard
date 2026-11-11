import type { NextConfig } from "next";
const pages = process.env.PAGES_STATIC === "true";
const config: NextConfig = {
  output: pages ? "export" : "standalone",
  ...(pages ? { basePath: process.env.NEXT_PUBLIC_BASE_PATH || "", trailingSlash: true } : {}),
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "/*": ["./.private/**/*", "./.env*", "./tests/**/*"],
  },
  serverExternalPackages: ["google-auth-library"],
  ...(pages ? {} : { async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  }}),
};
export default config;
