import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/media/:path*", destination: "/api/media/:path*" },
    ];
  },
};

export default nextConfig;
