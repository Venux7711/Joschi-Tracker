'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { teileDialog, type Stimme, type Zeitraum } from '@/lib/thoughts'
import type { Cat } from '@/lib/types'

/**
 * Was die Katzen denken.
 *
 * Zwei Achsen: der Zeitraum, über den geredet wird, und die Stimme, die redet.
 * Der Zeitraum steht als durchgehende Leiste über der Karte, weil er ihren
 * ganzen Inhalt bestimmt; die Stimme daneben als kleine Pillen, weil sie nur
 * den Ton wechselt.
 *
 * Der Text wird einmal erzeugt und gespeichert. Er ändert sich also beim
 * Neuladen nicht, und genau das ist gewollt: Ein Spruch, der sich bei jedem
 * Blick neu würfelt, ist keiner mehr.
 */

/**
 * Je Bild ein eigener Satz.
 *
 * Vorher stand unter allen Fotos derselbe Text. Wer das dritte Foto antippte
 * und den Kommentar zum ersten las, hielt die Karte zu Recht für kaputt.
 *
 * datum ist nur bei Rückblicken gesetzt und beschriftet die Station – ohne die
 * Angabe sind fünf Bilder einer Woche fünf beliebige Fotos.
 */
type Zeile = {
  fotoId: string
  fotoUrl: string
  /** Verkleinerte Fassung für den Streifen; fehlt bei älteren Einträgen. */
  fotoThumb?: string | null
  /**
   * Ob die Adressen schon verkleinerte Fassungen sind.
   *
   * Dann werden sie unverändert ausgeliefert – kleiner macht sie ohnehin
   * niemand mehr, und der Bilddienst hat ein Monatskontingent, das sich
   * unbemerkt leert.
   */
  abgeleitet?: boolean
  text: string
  premise: string | null
  datum?: string | null
}

type Gedanke = {
  text: string
  foto: string | null
  fotoId: string | null
  zeilen: Zeile[]
}

type Karte = {
  zeitraum: Zeitraum
  tag: string
  titel: string
  quelle: 'ki' | 'ersatz'
  gedanken: Record<Stimme, Gedanke>
}

type Antwort = {
  zeitraeume: { key: Zeitraum; titel: string; bereit: boolean }[]
  karten: Partial<Record<Zeitraum, Karte>>
}

const STIMMEN: { key: Stimme; label: string }[] = [
  { key: 'joschi', label: 'Joschi' },
  { key: 'bella', label: 'Bella' },
  { key: 'beide', label: 'Beide' },
]

const ZEITRAUM_LABEL: Record<Zeitraum, string> = {
  tag: 'Gestern',
  woche: 'Woche',
  monat: 'Monat',
  damals: 'Damals',
}

/**
 * Die Überschrift über dem Fazit eines Rückblicks.
 *
 * Beim Tagesfenster gibt es das nicht – dort gehört jeder Satz zu einem Foto.
 */
const FAZIT_LABEL: Partial<Record<Zeitraum, string>> = {
  woche: 'Die Woche',
  monat: 'Der Monat',
  damals: 'Der Tag',
}

/** Auswahl innerhalb einer Karte: eine Foto-Kennung oder das Fazit. */
type Auswahl = { art: 'fazit' } | { art: 'foto'; id: string }

export default function CatThoughts({ cats }: { cats: Cat[] }) {
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [aktiv, setAktiv] = useState<Stimme>('joschi')
  const [zeitraum, setZeitraum] = useState<Zeitraum>('tag')
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)
  const [wuerfelt, setWuerfelt] = useState(false)
  /** Welcher Zeitraum gerade nachgeholt wird – für den eigenen Wartezustand. */
  const [holt, setHolt] = useState<Zeitraum | null>(null)

  const laden = useCallback(() => {
    setFehler(null)
    fetch('/api/thoughts')
      .then(async r => {
        if (r.ok) return r.json()
        // 504 heißt: Die Erzeugung hat zu lange gedauert. Das ist etwas
        // anderes als ein kaputter Aufruf und verdient einen eigenen Satz.
        throw new Error(r.status === 504 ? 'zeit' : 'fehler')
      })
      .then(setDaten)
      .catch(e => setFehler(e?.message === 'zeit' ? 'zeit' : 'fehler'))
  }, [])

  useEffect(() => { laden() }, [laden])

  // Beim Wechsel von Stimme oder Zeitraum zurück auf den Anfang der Karte
  useEffect(() => { setAuswahl(null) }, [aktiv, zeitraum])

  const karte = daten?.karten?.[zeitraum] ?? null
  const istRueckblick = zeitraum !== 'tag'

  /**
   * Einen Zeitraum nachholen, der nachts nicht erzeugt wurde.
   *
   * Erst beim Antippen und nicht im Hintergrund beim Laden der Seite: Jeder
   * Rückblick kostet einen Modellaufruf, und der soll nur anfallen, wenn ihn
   * jemand sehen will.
   */
  const hole = useCallback((ziel: Zeitraum) => {
    setHolt(ziel)
    fetch(`/api/thoughts?zeitraum=${ziel}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('fehler'))))
      .then((k: Karte) => {
        setDaten(d => (d ? { ...d, karten: { ...d.karten, [ziel]: k } } : d))
        setHolt(null)
      })
      .catch(() => setHolt(null))
  }, [])

  const waehleZeitraum = (ziel: Zeitraum) => {
    setZeitraum(ziel)
    if (!daten?.karten?.[ziel] && holt !== ziel) hole(ziel)
  }

  /** Nochmal würfeln – ein misslungener Satz stünde sonst bis morgen da. */
  const nochmal = async () => {
    setWuerfelt(true)
    try {
      const res = await fetch('/api/thoughts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zeitraum }),
      })
      if (res.ok) {
        const k: Karte = await res.json()
        setDaten(d => (d ? { ...d, karten: { ...d.karten, [zeitraum]: k } } : d))
        setAuswahl(null)
      }
    } catch {
      // Der alte Satz bleibt stehen – schlechter als vorher wird es nicht
    }
    setWuerfelt(false)
  }

  const bildVon = (name: string) =>
    cats.find(c => c.name.toLowerCase() === name.toLowerCase())?.photo_url ?? null

  // Bella hat ein eigenes Thema; die Karte färbt sich mit, wenn sie spricht.
  const akzent = aktiv === 'bella' ? '#6E8090' : aktiv === 'joschi' ? '#D97706' : '#8B7BA8'

  const gedanke = karte?.gedanken?.[aktiv] ?? null

  /**
   * Die Stationen dieser Stimme.
   *
   * Ältere Einträge kennen noch keinen Satz je Bild – dann bleibt es beim
   * einen Satz mit dem einen Bild, so wie es vorher war.
   */
  const zeilen: Zeile[] = gedanke?.zeilen?.length
    ? gedanke.zeilen
    : gedanke?.foto && gedanke.fotoId
      ? [{ fotoId: gedanke.fotoId, fotoUrl: gedanke.foto, text: gedanke.text, premise: null }]
      : []

  /**
   * Welcher Satz gerade dasteht.
   *
   * Ein Rückblick öffnet mit dem Fazit über den ganzen Zeitraum – das ist sein
   * Sinn. Ein Tag öffnet mit seinem ersten Bild, denn dort gehört jeder Satz
   * zu einem Foto, und ein Fazit über einen einzelnen Tag gibt es nicht.
   */
  const aktuelleZeile: Zeile | null =
    auswahl?.art === 'fazit' ? null
      : auswahl?.art === 'foto' ? zeilen.find(z => z.fotoId === auswahl.id) ?? null
        : istRueckblick ? null
          : zeilen[0] ?? null

  const anzeigeText = aktuelleZeile?.text ?? gedanke?.text ?? ''
  const fazitGewaehlt = aktuelleZeile === null

  // Bewusst kein stilles Verschwinden: Beim ersten Anlauf lief die Erzeugung
  // in eine Zeitüberschreitung, die Karte war schlicht weg, und von außen war
  // nicht zu unterscheiden, ob sie fehlt oder nie gebaut wurde.
  if (fehler) {
    return (
      <div className="card" style={{ padding: '14px 18px', borderLeft: '3px solid rgba(60,60,67,0.2)' }}>
        <p style={eyebrow}>Was die Katzen denken</p>
        <p style={{ fontSize: 13, color: 'rgba(60,60,67,0.55)', marginTop: 6 }}>
          {fehler === 'zeit'
            ? 'Die Katzen denken noch nach – das dauert beim ersten Mal am Tag etwas länger.'
            : 'Konnte gerade nicht geladen werden.'}
        </p>
        <button onClick={laden} style={knopf}>Nochmal versuchen</button>
      </div>
    )
  }

  /**
   * Solange geladen wird, stehen die beiden sicheren Zeiträume schon da.
   *
   * Sonst erschiene die Leiste erst nach der Antwort und schöbe alles darunter
   * nach unten – genau in dem Moment, in dem man zu lesen anfängt. 'damals'
   * fehlt hier, weil erst die Antwort weiß, ob es Vergangenheit gibt.
   */
  const zeitraeume: Antwort['zeitraeume'] = daten?.zeitraeume ?? [
    { key: 'tag', titel: '', bereit: false },
    { key: 'woche', titel: '', bereit: false },
    { key: 'monat', titel: '', bereit: false },
  ]

  return (
    <div
      className="card overflow-hidden"
      style={{ borderLeft: `3px solid ${akzent}`, transition: 'border-color 0.25s ease' }}
    >
      <div className="flex items-center justify-between gap-3" style={{ padding: '13px 18px 0' }}>
        <p style={eyebrow}>Was die Katzen denken</p>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {STIMMEN.map(s => (
            <button
              key={s.key}
              onClick={() => setAktiv(s.key)}
              aria-pressed={aktiv === s.key}
              style={{
                fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 999, border: 'none',
                background: aktiv === s.key ? akzent : 'rgba(60,60,67,0.06)',
                color: aktiv === s.key ? 'white' : 'rgba(60,60,67,0.5)',
                transition: 'background 0.2s ease',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Die Zeitraumleiste.
          Durchgehend und breit statt als vierte Pille neben den Stimmen: Sie
          wechselt den ganzen Inhalt der Karte, nicht nur den Ton. Zeiträume,
          für die es keine Vergangenheit gibt, stehen gar nicht erst da – ein
          Knopf, der ins Leere führt, ist schlimmer als keiner. */}
      {zeitraeume.length > 1 && (
        <div style={{ padding: '10px 18px 0' }}>
          <div
            role="tablist"
            style={{
              display: 'flex', gap: 2, padding: 2, borderRadius: 10,
              background: 'rgba(60,60,67,0.06)',
            }}
          >
            {zeitraeume.map(z => (
              <button
                key={z.key}
                role="tab"
                aria-selected={zeitraum === z.key}
                onClick={() => waehleZeitraum(z.key)}
                style={{
                  flex: 1, fontSize: 12, fontWeight: 600, padding: '6px 4px',
                  borderRadius: 8, border: 'none',
                  background: zeitraum === z.key ? 'white' : 'transparent',
                  color: zeitraum === z.key ? '#1C1C1E' : 'rgba(60,60,67,0.5)',
                  boxShadow: zeitraum === z.key ? '0 1px 3px rgba(0,0,0,0.09)' : 'none',
                  transition: 'background 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                {ZEITRAUM_LABEL[z.key]}
              </button>
            ))}
          </div>
          {/* "Die Woche" allein sagt nicht, welche. Die Spanne gehört
              dazugeschrieben, sonst muss man raten. */}
          <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.4)', marginTop: 6 }}>
            {zeitraeume.find(z => z.key === zeitraum)?.titel ?? ''}
          </p>
        </div>
      )}

      {/* Wird der Zeitraum gerade erst zusammengestellt, sagt die Karte das –
          statt leer dazustehen oder auf gestern zurückzuspringen. */}
      {holt === zeitraum ? (
        <div style={{ padding: '14px 18px 18px' }}>
          <p style={{ fontSize: 13, color: 'rgba(60,60,67,0.55)' }}>
            {zeitraum === 'woche'
              ? 'Die Woche wird zusammengestellt – sieben Tage wollen erst angesehen werden.'
              : zeitraum === 'monat'
                ? 'Der Monat wird zusammengestellt – das dauert einen Moment länger.'
                : 'Der alte Tag wird herausgesucht.'}
          </p>
          <div className="space-y-2" style={{ marginTop: 10 }}>
            <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: '88%' }} />
            <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: '56%' }} />
          </div>
        </div>
      ) : daten && !karte ? (
        <div style={{ padding: '14px 18px 18px' }}>
          <p style={{ fontSize: 13, color: 'rgba(60,60,67,0.55)' }}>
            Dieser Rückblick konnte nicht erstellt werden.
          </p>
          <button onClick={() => hole(zeitraum)} style={knopf}>Nochmal versuchen</button>
        </div>
      ) : (
        <>
          {/* Das Bild, über das diese Stimme spricht. Ohne es liest sich ein
              Satz über die Schlafstellung wie eine Behauptung; daneben wird er
              zur Pointe.

              key auf der Bild-Adresse: Ohne das tauscht React nur die Quelle im
              bestehenden Element aus, und beim Umschalten bliebe für einen
              Moment das alte Bild stehen. */}
          {aktuelleZeile && (
            <div style={{ padding: '10px 18px 0' }}>
              <a
                href={`/fotos?photo=${aktuelleZeile.fotoId}`}
                className="relative block overflow-hidden"
                style={{
                  width: '100%', aspectRatio: '4 / 3', borderRadius: 12,
                  background: 'rgba(60,60,67,0.06)', border: `1px solid ${akzent}22`,
                }}
              >
                <Image
                  key={aktuelleZeile.fotoUrl}
                  src={aktuelleZeile.fotoUrl}
                  unoptimized={aktuelleZeile.abgeleitet ?? false}
                  alt="Das Foto, über das gesprochen wird"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 600px"
                  style={{ animation: 'fadeIn 0.35s ease' }}
                />
                <span style={bildMarke}>
                  {aktuelleZeile.datum ?? 'Darüber wird geredet'}
                </span>
              </a>
            </div>
          )}

          {/* Die Stationen.
              Beim Tagesfenster die Fotos, zu denen diese Stimme etwas gesagt
              hat. Beim Rückblick steht das Fazit als erste Station davor: So
              gibt es einen einzigen Auswahlzustand statt eines Zurück-Knopfes,
              der nur manchmal da ist.

              Nur Bilder mit eigenem Satz – ein Foto ohne einen aufzunehmen
              hieße, beim Antippen einen fremden Kommentar danebenzustellen. */}
          {(zeilen.length > 1 || (istRueckblick && zeilen.length > 0)) && (
            <div
              className="flex gap-2"
              style={{ overflowX: 'auto', padding: '10px 18px 2px' }}
            >
              {istRueckblick && (
                <button
                  onClick={() => setAuswahl({ art: 'fazit' })}
                  aria-pressed={fazitGewaehlt}
                  className="flex-shrink-0 flex flex-col items-center justify-center"
                  style={{
                    width: 58, height: 58, borderRadius: 10, gap: 2,
                    border: fazitGewaehlt ? `2px solid ${akzent}` : '1px solid rgba(60,60,67,0.12)',
                    background: fazitGewaehlt ? `${akzent}12` : 'rgba(60,60,67,0.03)',
                    color: fazitGewaehlt ? akzent : 'rgba(60,60,67,0.45)',
                  }}
                >
                  <span style={{ fontSize: 15 }}>💭</span>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.03em' }}>Fazit</span>
                </button>
              )}
              {zeilen.map(z => {
                const gewaehlt = aktuelleZeile?.fotoId === z.fotoId
                return (
                  <button
                    key={z.fotoId}
                    onClick={() => setAuswahl({ art: 'foto', id: z.fotoId })}
                    aria-pressed={gewaehlt}
                    aria-label={z.datum ? `Station ${z.datum}` : 'Was die Stimme zu diesem Foto sagt'}
                    className="flex-shrink-0"
                    style={{ width: 58 }}
                  >
                    <div
                      className="relative overflow-hidden"
                      style={{
                        width: 58, height: 58, borderRadius: 10,
                        border: gewaehlt ? `2px solid ${akzent}` : '1px solid rgba(60,60,67,0.1)',
                        opacity: gewaehlt ? 1 : 0.55,
                        transition: 'opacity 0.2s ease',
                      }}
                    >
                      <Image
                        src={z.fotoThumb ?? z.fotoUrl}
                        unoptimized={z.abgeleitet ?? false}
                        alt="" fill className="object-cover" sizes="58px"
                      />
                    </div>
                    {/* Der Wochentag unter der Station: Ohne ihn ist eine
                        Woche eine Reihe beliebiger Bilder. */}
                    {z.datum && (
                      <span
                        style={{
                          display: 'block', fontSize: 9, marginTop: 3, textAlign: 'center',
                          fontWeight: gewaehlt ? 700 : 500,
                          color: gewaehlt ? akzent : 'rgba(60,60,67,0.4)',
                        }}
                      >
                        {z.datum}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ padding: '12px 18px 16px' }}>
            {!daten ? (
              <div className="space-y-2">
                <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: '92%' }} />
                <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: '64%' }} />
              </div>
            ) : (
              <>
                {/* Beim Rückblick steht über dem Fazit, worüber es geht. Ohne
                    diese Zeile liest sich ein Wochenfazit wie ein besonders
                    vager Tagessatz. */}
                {istRueckblick && fazitGewaehlt && (
                  <p style={{ ...eyebrow, marginBottom: 7, color: akzent, opacity: 0.75 }}>
                    {FAZIT_LABEL[zeitraum] ?? 'Fazit'}
                  </p>
                )}

                {aktiv === 'beide' ? (
                  // Der Dialog bekommt zwei Blasen, versetzt wie ein
                  // Chatverlauf – als eine Zeile gelesen ginge die Pointe des
                  // Konterns verloren.
                  <div className="space-y-2">
                    {teileDialog(anzeigeText).map((zeile, i) => (
                      <Sprechblase
                        key={i}
                        name={zeile.wer}
                        bild={zeile.wer ? bildVon(zeile.wer) : null}
                        text={zeile.was}
                        rechts={zeile.wer.toLowerCase() === 'bella'}
                        farbe={zeile.wer.toLowerCase() === 'bella' ? '#6E8090' : '#D97706'}
                      />
                    ))}
                  </div>
                ) : (
                  <Sprechblase
                    name={aktiv === 'joschi' ? 'Joschi' : 'Bella'}
                    bild={bildVon(aktiv === 'joschi' ? 'Joschi' : 'Bella')}
                    text={anzeigeText}
                    rechts={false}
                    farbe={akzent}
                    gross
                  />
                )}
              </>
            )}

            <div className="flex items-center justify-between gap-3" style={{ marginTop: 10 }}>
              {/* Ehrlich bleiben: Ist die KI ausgefallen, stammt der Satz aus
                  einer festen Liste. Das gehört dazugesagt, sonst hält man ihn
                  für erfunden. */}
              <span style={{ fontSize: 10, color: 'rgba(60,60,67,0.3)' }}>
                {karte?.quelle === 'ersatz' ? 'Ohne KI zusammengesetzt' : ''}
              </span>
              {karte && (
                <button
                  onClick={nochmal}
                  disabled={wuerfelt}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 8,
                    border: 'none', background: 'rgba(60,60,67,0.06)',
                    color: 'rgba(60,60,67,0.55)', flexShrink: 0,
                  }}
                >
                  {wuerfelt ? 'würfelt…' : '🎲 Nochmal'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'rgba(60,60,67,0.38)',
}

const knopf: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, marginTop: 8, padding: '6px 12px',
  borderRadius: 8, border: 'none', background: 'rgba(60,60,67,0.07)', color: '#3C3C43',
}

const bildMarke: React.CSSProperties = {
  position: 'absolute', left: 8, bottom: 8,
  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 999,
  background: 'rgba(0,0,0,0.55)', color: 'white',
}

function Sprechblase({
  name, bild, text, rechts, farbe, gross,
}: {
  name: string
  bild: string | null
  text: string
  rechts: boolean
  farbe: string
  gross?: boolean
}) {
  return (
    <div className="flex items-start gap-2.5" style={{ flexDirection: rechts ? 'row-reverse' : 'row' }}>
      <div
        className="relative flex-shrink-0 overflow-hidden"
        style={{
          width: gross ? 42 : 30, height: gross ? 42 : 30, borderRadius: 999,
          background: 'rgba(60,60,67,0.07)', border: `1.5px solid ${farbe}33`,
        }}
      >
        {bild ? (
          <Image src={bild} alt={name} fill className="object-cover" sizes="42px" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: gross ? 20 : 15 }}>
            🐱
          </span>
        )}
      </div>

      <div style={{ minWidth: 0, textAlign: rechts ? 'right' : 'left' }}>
        {!gross && name && (
          <p style={{ fontSize: 10, fontWeight: 700, color: farbe, marginBottom: 2 }}>{name}</p>
        )}
        <p
          style={{
            fontSize: gross ? 15 : 13.5,
            lineHeight: 1.45,
            color: '#1C1C1E',
            fontStyle: 'italic',
            display: 'inline-block',
            textAlign: 'left',
          }}
        >
          „{text}"
        </p>
      </div>
    </div>
  )
}
