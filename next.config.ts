import type { NextConfig } from "next";

// unpkg.com hosts the FFmpeg WASM core used by the video export pipeline;
// fonts.googleapis.com/fonts.gstatic.com serve on-demand Google Fonts.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // blob: is required here (not just worker-src) because the FFmpeg WASM
  // loader spawns its worker from a blob: URL in a way some browsers
  // attribute to script-src rather than worker-src.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data: https://fonts.gstatic.com https://*.supabase.co",
  // blob: here too: the FFmpeg worker fetch()es its WASM binary from a
  // blob: URL we create for it, which connect-src (not worker-src) governs.
  "connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com https://unpkg.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    // Scoped to production only so local `next dev` (Turbopack HMR, eval
    // sourcemaps) is never at risk of being broken by this policy.
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
