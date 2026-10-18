/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL || "";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // В Docker Traefik (host) не достаёт backend в bridge — проксируем /api через Next.
    if (!backendUrl) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
