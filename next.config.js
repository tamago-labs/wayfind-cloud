/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "s2.coinmarketcap.com" },
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "coin-images.coingecko.com" },
      { protocol: "https", hostname: "play-lh.googleusercontent.com" },
      { protocol: "https", hostname: "https://static.okx.com" }
    ],
  },
  env: {
    NEXT_PUBLIC_CHAT_API_URL: process.env.NEXT_PUBLIC_CHAT_API_URL,
  },
  serverRuntimeConfig: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
     CMC_API_KEY: process.env.CMC_API_KEY,
     COINGECKO_API_KEY: process.env.COINGECKO_API_KEY,
    OKX_API_KEY: process.env.OKX_API_KEY,
    OKX_SECRET_KEY: process.env.OKX_SECRET_KEY,
    OKX_PASSPHRASE: process.env.OKX_PASSPHRASE,
    MASSIVE_API_KEY: process.env.MASSIVE_API_KEY,
  },
  experimental: {
    serverComponentsExternalPackages: ["lightweight-charts"],
  },
}

module.exports = nextConfig;
