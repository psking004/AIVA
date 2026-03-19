/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    AIVA_API_URL: process.env.AIVA_API_URL || 'http://localhost:4000',
  },
};

module.exports = nextConfig;
