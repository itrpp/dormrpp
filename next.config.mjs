/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // ให้ใช้ URL /dormrpp แทน /admin โดยไม่กระทบ route เดิม
      {
        source: '/dormrpp',
        destination: '/admin',
      },
      {
        source: '/dormrpp/:path*',
        destination: '/admin/:path*',
      },
    ];
  },
};

export default nextConfig;

