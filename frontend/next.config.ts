import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NATIVE_EXPORT === "1"
    ? {
        output: "export" as const,
        distDir: ".next-native",
        typescript: { tsconfigPath: "tsconfig.native.json" },
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  devIndicators: false,
  poweredByHeader: false,
  ...(process.env.NATIVE_EXPORT === "1"
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                // Invitation URLs must not leak through outbound referrer headers.
                { key: "Referrer-Policy", value: "no-referrer" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
