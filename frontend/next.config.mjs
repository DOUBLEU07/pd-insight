/**
 * The browser always talks to the Next.js origin and never to the API host
 * directly. `/api/v1/*` is proxied server-side to the FastAPI container, so the
 * same build works on localhost, a LAN IP or a Cloudflare tunnel URL without
 * rebuilding — NEXT_PUBLIC_* values are inlined at build time and could not.
 *
 * @type {import('next').NextConfig}
 */
const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? 'http://api:8000').replace(/\/$/, '');

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',

  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${API_INTERNAL_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
