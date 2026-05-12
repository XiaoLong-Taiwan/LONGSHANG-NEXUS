/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/v1/:path*", destination: "/api/proxy/v1/:path*" },
      { source: "/api/v1/:path*", destination: "/api/proxy/api/v1/:path*" },
      { source: "/models", destination: "/api/proxy/models" },
      { source: "/chat/completions", destination: "/api/proxy/chat/completions" },
      { source: "/embeddings", destination: "/api/proxy/embeddings" },
      { source: "/images/generations", destination: "/api/proxy/images/generations" },
    ];
  },
};

module.exports = nextConfig;
