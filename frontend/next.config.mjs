/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monaco is loaded client-side via next/dynamic (ssr:false); no special webpack needed.
  // Allow the workspace to be a pure client app under the App Router.
  eslint: {
    // Don't fail production builds on lint; we lint separately.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
