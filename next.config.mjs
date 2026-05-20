/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Cloudflare Pages
  images: { unoptimized: true },
  turbopack: {
    root: '.',
  },
}

export default nextConfig
