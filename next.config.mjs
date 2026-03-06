/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // เพิ่มขีดจำกัดขนาด request body สำหรับอัปโหลดไฟล์ (ประกาศ) — บน server มัก default ~1MB
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // ขยาย buffer ของ request body (ใช้กับ Route Handler ที่รับ FormData)
    proxyClientMaxBodySize: '50mb',
  },
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

