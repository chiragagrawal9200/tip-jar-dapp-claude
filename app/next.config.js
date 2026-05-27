/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required so wallet adapter CSS can be imported
  transpilePackages: [
    "@solana/wallet-adapter-react-ui",
  ],
  webpack: (config) => {
    // Fixes Buffer polyfill for @solana/web3.js in the browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

module.exports = nextConfig;
