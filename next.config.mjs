const isDev = process.env.NODE_ENV !== "production";
// Vercel injects its feedback toolbar (vercel.live) on preview deployments.
const isVercelPreview = process.env.VERCEL_ENV === "preview";
const vercelLive = isVercelPreview ? " https://vercel.live" : "";

// 'unsafe-inline' for scripts is needed for Next's inline hydration data and
// the next-themes no-flash script. A nonce-based CSP would remove it but
// forces every page to render dynamically; the rest of the policy still
// blocks third-party script origins, plugins, framing and form hijacking.
// 'unsafe-eval' and ws: are dev-only (React Refresh / HMR).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${vercelLive}`,
  `style-src 'self' 'unsafe-inline'${vercelLive}`,
  `img-src 'self' data: blob:${vercelLive}${isVercelPreview ? " https://vercel.com" : ""}`,
  `font-src 'self' data:${isVercelPreview ? " https://vercel.live https://assets.vercel.com" : ""}`,
  `connect-src 'self'${isDev ? " ws:" : ""}${isVercelPreview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `frame-src ${isVercelPreview ? "https://vercel.live" : "'none'"}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // No upgrade-insecure-requests: self-hosted installs may serve plain http.
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Legacy equivalent of frame-ancestors for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Browsers ignore HSTS over plain http, so this is harmless on localhost.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
