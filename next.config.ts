import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* allow cross-origin dev asset requests from the preview panel domains */
  allowedDevOrigins: ["*.space-z.ai", "*.z.ai"],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
