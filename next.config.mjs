// BASE_PATH lets the app run under a path such as /cheapcart/ behind a proxy.
// It is read at build time (from the environment or .env), so rebuild after changing it.
const basePath = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Under a base path nginx sends /cheapcart to /cheapcart/, so Next must not redirect it back.
  ...(basePath ? { basePath, skipTrailingSlashRedirect: true } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
