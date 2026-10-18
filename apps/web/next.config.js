/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    AIVA_API_URL: process.env.AIVA_API_URL || process.env.NEXT_PUBLIC_AIVA_API_URL || 'https://aiva-yitg.onrender.com',
    NEXT_PUBLIC_AIVA_API_URL: process.env.NEXT_PUBLIC_AIVA_API_URL || process.env.AIVA_API_URL || 'https://aiva-yitg.onrender.com',
  },
};

module.exports = nextConfig;
