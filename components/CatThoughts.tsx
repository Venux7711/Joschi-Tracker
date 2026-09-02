'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { teileDialog, type Stimme } from '@/lib/thoughts'
import type { Cat } from '@/lib/types'

/**
 * Was die Katzen über gestern denken.
 *
 * Drei Stimmen zum Durchtippen: Joschi, Bella und beide im Streitgespräch.
 * Umgeschaltet statt untereinander gestapelt – so ist jeder Blick eine kleine
 * Entdeckung, und die Karte bleibt kurz.
 *
 * Der Text wird einmal am Tag erzeugt und gespeichert. Er ändert sich also
 * beim Neuladen nicht, und genau das ist gewollt: Ein Spruch, der sich bei
 * jedem Blick neu würfelt, ist keiner mehr.
 */

/**
 * Je Stimme ein eigener Gedanke mit dem Bild, auf das er sich bezieht.
 *
 * Vorher stand über allen drei Stimmen dasselbe Foto. Das war irreführend:
 * Bella redet über den Teppich, Joschi über die Werkbank – dann muss auch das
 * passende Bild danebenstehen, sonst geht die Pointe verloren.
 */
type Zeile = { fotoId: string; fotoUrl: string; text: string; premise: string | null }

type Gedanke = {
  text: string
  foto: string | null
  fotoId: string | null
  /**
   * Je Bild ein eigener Satz.
   *
   * Vorher stand unter allen Fotos derselbe Text. Wer das dritte Foto antippte
   * und den Kommentar zum ersten las, hielt die Karte zu Recht für kaputt.
   */
  zeilen: Zeile[]
}

type Antwort = {
  tag: string
  gedanken: Record<Stimme, Gedanke>
  quelle: 'ki' | 'ersatz'
}

const STIMMEN: { key: Stimme; label: string }[] = [
  { key: 'joschi', label: 'Joschi' },
  { key: 'bella', label: 'Bella' },
  { key: 'beide', label: 'Beide' },
]

export default function CatThoughts({ cats }: { cats: Cat[] }) {
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [aktiv, setAktiv] = useState<Stimme>('joschi')

  const laden = () => {
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
  }

  useEffect(laden, [])

  const [wuerfelt, setWuerfelt] = useState(false)
  // Welches Bild gerade groß zu sehen ist. null = das erste der Stimme.
  const [gewaehltesFoto, setGewaehltesFoto] = useState<string | null>(null)

  // Beim Stimmenwechsel zurück auf das erste Bild dieser Stimme
  useEffect(() => { setGewaehltesFoto(null) }, [aktiv])

  /** Nochmal würfeln – ein misslungener Satz stünde sonst bis morgen da. */
  const nochmal = async () => {
    setWuerfelt(true)
    try {
      const res = await fetch('/api/thoughts', { method: 'POST' })
      if (res.ok) setDaten(await res.json())
    } catch {
      // Der alte Satz bleibt stehen – schlechter als vorher wird es nicht
    }
    setWuerfelt(false)
  }

  const katzeMit = (name: string) =>
    cats.find(c => c.name.toLowerCase() === name.toLowerCase())

  const bildVon = (name: string) => katzeMit(name)?.photo_url ?? null

  // Bella hat ein eigenes Thema; die Karte färbt sich mit, wenn sie spricht.
  const akzent = aktiv === 'bella' ? '#6E8090' : aktiv === 'joschi' ? '#D97706' : '#8B7BA8'

  const aktuellerGedanke = daten?.gedanken?.[aktiv] ?? null

  /**
   * Die Sätze dieser Stimme, je einer zu einem Bild.
   *
   * Ältere Einträge kennen das noch nicht – dann bleibt es beim einen Satz
   * mit dem einen Bild, so wie es vorher war.
   */
  const zeilen: Zeile[] = aktuellerGedanke?.zeilen?.length
    ? aktuellerGedanke.zeilen
    : aktuellerGedanke?.foto && aktuellerGedanke.fotoId
      ? [{
          fotoId: aktuellerGedanke.fotoId,
          fotoUrl: aktuellerGedanke.foto,
          text: aktuellerGedanke.text,
          premise: null,
        }]
      : []

  const aktuelleZeile =
    zeilen.find(z => z.fotoId === gewaehltesFoto) ?? zeilen[0] ?? null

  const aktuellesFoto = aktuelleZeile?.fotoUrl ?? null
  const aktuelleFotoId = aktuelleZeile?.fotoId ?? null
  /** Der Text gehört immer zum gezeigten Bild – das ist jetzt garantiert. */
  const anzeigeText = aktuelleZeile?.text ?? aktuellerGedanke?.text ?? ''

  // Bewusst kein stilles Verschwinden mehr: Beim ersten Anlauf lief die
  // Erzeugung in eine Zeitüberschreitung, die Karte war schlicht weg, und von
  // außen war nicht zu unterscheiden, ob sie fehlt oder nie gebaut wurde.
  if (fehler) {
    return (
      <div className="card" style={{ padding: '14px 18px', borderLeft: '3px solid rgba(60,60,67,0.2)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(60,60,67,0.38)' }}>
          Gedanken zu gestern
        </p>
        <p style={{ fontSize: 13, color: 'rgba(60,60,67,0.55)', marginTop: 6 }}>
          {fehler === 'zeit'
            ? 'Die Katzen denken noch nach – das dauert beim ersten Mal am Tag etwas länger.'
            : 'Konnte gerade nicht geladen werden.'}
        </p>
        <button
          onClick={laden}
          style={{
            fontSize: 12, fontWeight: 600, marginTop: 8, padding: '6px 12px',
            borderRadius: 8, border: 'none', background: 'rgba(60,60,67,0.07)', color: '#3C3C43',
          }}
        >
          Nochmal versuchen
        </button>
      </div>
    )
  }

  return (
    <div
      className="card overflow-hidden"
      style={{ borderLeft: `3px solid ${akzent}`, transition: 'border-color 0.25s ease' }}
    >
      <div className="flex items-center justify-between gap-3" style={{ padding: '13px 18px 0' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(60,60,67,0.38)' }}>
          Gedanken zu gestern
        </p>
        <div style={{ display: 'flex', gap: 3 }}>
          {STIMMEN.map(s => (
            <button
              key={s.key}
              onClick={() => setAktiv(s.key)}
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

      {/* Das Bild, über das diese Stimme spricht. Ohne es liest sich ein Satz
          über die Schlafstellung wie eine Behauptung; daneben wird er zur
          Pointe.

          key auf der Bild-Adresse: Ohne das tauscht React nur die Quelle im
          bestehenden Element aus, und beim Umschalten bliebe für einen Moment
          das alte Bild stehen. Mit key wird es neu aufgebaut und lädt sauber. */}
      {aktuellesFoto && (
        <div style={{ padding: '10px 18px 0' }}>
          <a
            href={aktuelleFotoId ? `/fotos?photo=${aktuelleFotoId}` : '/fotos'}
            className="relative block overflow-hidden"
            style={{
              width: '100%', aspectRatio: '4 / 3', borderRadius: 12,
              background: 'rgba(60,60,67,0.06)', border: `1px solid ${akzent}22`,
            }}
          >
            <Image
              key={aktuellesFoto}
              src={aktuellesFoto}
              alt="Das Foto, über das gesprochen wird"
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 600px"
              style={{ animation: 'fadeIn 0.35s ease' }}
            />
            {/* Die Marke stimmt jetzt immer: Zu jedem Bild gehört sein
                eigener Satz, angezeigt wird nur dieses Paar. */}
            <span
              style={{
                position: 'absolute', left: 8, bottom: 8,
                fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 999,
                background: 'rgba(0,0,0,0.55)', color: 'white',
              }}
            >
              Darüber wird geredet
            </span>
          </a>

          {/* Der ganze Tag als Streifen.
              Das Modell sieht eine Auswahl – der Mensch soll alles sehen
              können. An einem gewöhnlichen Tag sind das vier bis sechs Bilder;
              die zu verstecken, während die Karte „Rückblick" heißt, wäre
              eigenartig. Erst ab zwei Bildern, sonst ist es Zierrat. */}
          {/* Nur Bilder, zu denen diese Stimme etwas gesagt hat.
              Ein Foto ohne eigenen Satz aufzunehmen hieße, beim Antippen einen
              fremden Kommentar danebenzustellen – genau der Fehler, den diese
              Änderung behebt. */}
          {zeilen.length > 1 && (
            <div className="flex gap-1.5 mt-2" style={{ overflowX: 'auto', paddingBottom: 2 }}>
              {zeilen.map(z => {
                const aktivesBild = z.fotoId === aktuelleFotoId
                return (
                  <button
                    key={z.fotoId}
                    onClick={() => setGewaehltesFoto(z.fotoId)}
                    aria-label="Was die Stimme zu diesem Foto sagt"
                    className="relative flex-shrink-0 overflow-hidden"
                    style={{
                      width: 46, height: 46, borderRadius: 8,
                      border: aktivesBild ? `2px solid ${akzent}` : '1px solid rgba(60,60,67,0.1)',
                      opacity: aktivesBild ? 1 : 0.55,
                      transition: 'opacity 0.2s ease',
                    }}
                  >
                    <Image src={z.fotoUrl} alt="" fill className="object-cover" sizes="46px" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '10px 18px 16px' }}>
        {!daten ? (
          <div className="space-y-2">
            <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: '92%' }} />
            <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: '64%' }} />
          </div>
        ) : aktiv === 'beide' ? (
          // Der Dialog bekommt zwei Blasen, versetzt wie ein Chatverlauf –
          // als eine Zeile gelesen ginge die Pointe des Konterns verloren.
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

        <div className="flex items-center justify-between gap-3" style={{ marginTop: 10 }}>
          {/* Ehrlich bleiben: Ist die KI ausgefallen, stammt der Satz aus einer
              festen Liste. Das gehört dazugesagt, sonst hält man ihn für erfunden. */}
          <span style={{ fontSize: 10, color: 'rgba(60,60,67,0.3)' }}>
            {daten?.quelle === 'ersatz' ? 'Ohne KI zusammengesetzt' : ''}
          </span>
          {daten && (
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
    </div>
  )
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
