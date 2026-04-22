import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
