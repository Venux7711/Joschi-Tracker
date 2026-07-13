/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Client Router Cache: Next hält RSC-Payloads besuchter Seiten sonst 30s lang
    // für frisch – neu eingetragenes Futter erscheint im Verlauf dann verzögert.
    staleTimes: { dynamic: 0, static: 0 },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = nextConfig
