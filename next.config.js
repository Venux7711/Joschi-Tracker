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
  /**
   * Bildoptimierung – sparsam eingestellt.
   *
   * Anlass: Das Freikontingent von 5000 Transformationen im Monat war
   * aufgebraucht, danach liefern neue Bildgrößen einen Fehler statt eines
   * Bildes. Die Voreinstellungen von Next sind für Seiten gemacht, die
   * ständig neue Bilder zeigen; hier liegen dieselben knapp hundert Fotos,
   * die sich nie ändern, und werden täglich mehrfach angesehen.
   */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],

    /**
     * 31 Tage statt einer Stunde – der mit Abstand größte Posten.
     *
     * Die Voreinstellung sind 60 Sekunden, und darüber hinaus zählt, was der
     * Speicher als Cache-Control mitschickt: bei Supabase eine Stunde. Danach
     * gilt die fertige Größe als veraltet und wird neu berechnet. Dasselbe
     * Foto, dieselbe Breite, einmal pro Stunde angesehen – das sind
     * vierundzwanzig Transformationen am Tag für ein einziges Bild.
     *
     * Ein hochgeladenes Foto ändert sich nie: Jede Adresse zeigt für immer auf
     * dasselbe Bild. Es einen Monat lang aufzuheben ist also nicht bloß
     * vertretbar, sondern richtig.
     */
    minimumCacheTTL: 2_678_400,

    /**
     * Nur die Breiten, die diese App wirklich anfordert.
     *
     * Je Breite entsteht eine eigene Transformation. Voreingestellt sind
     * sechzehn Stufen bis 3840 Pixel – gedacht für Bildschirme, die es hier
     * nicht gibt. Acht Stufen decken alles ab, vom 42-Pixel-Kopfbild bis zur
     * Vollbildansicht auf dem iPhone.
     */
    deviceSizes: [640, 828, 1080, 1920],
    imageSizes: [64, 128, 256, 384],

    // Ein Format statt zwei: Jedes zusätzliche wäre eine weitere
    // Transformation je Bild und Breite.
    formats: ['image/webp'],
  },
}

module.exports = nextConfig
