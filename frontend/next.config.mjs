/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // /api/* проксирует app/api/[...path]/route.ts → BACKEND_URL (runtime)
};

export default nextConfig;
