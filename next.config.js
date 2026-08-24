/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Kennung der gebauten Fassung. Vercel setzt den Commit beim Bauen; lokal
    // reicht "dev". Der Browser bekommt sie fest ins Programm, der Server
    // liefert sie unter /api/version – der Vergleich verrät, ob auf dem Handy
    // noch eine alte Fassung läuft.
    NEXT_PUBLIC_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
  },
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
