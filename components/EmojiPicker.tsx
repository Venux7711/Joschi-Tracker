'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { EMOJI_GRUPPEN, EMOJI_STICHWORTE } from '@/lib/reactions'

/**
 * Auswahl aller Emojis – das, was hinter dem Plus liegt.
 *
 * Die Schnellauswahl deckt den Alltag ab; wer etwas Bestimmtes sucht, öffnet
 * hier. Nach Themen sortiert und durchsuchbar, weil ein Raster aus zweihundert
 * Zeichen ohne Struktur niemandem hilft.
 *
 * Dunkel gehalten, weil das Feld über dem Vollbild-Foto liegt.
 */
export default function EmojiPicker({
  onWaehlen,
  onSchliessen,
}: {
  onWaehlen: (emoji: string) => void
  onSchliessen: () => void
}) {
  const [suche, setSuche] = useState('')
  const feld = useRef<HTMLDivElement>(null)

  // Draußen tippen schließt. Ohne das bliebe die Auswahl offen, sobald man
  // sich anders entscheidet – und verdeckt das halbe Bild.
  useEffect(() => {
    const beiKlick = (e: MouseEvent | TouchEvent) => {
      if (feld.current && !feld.current.contains(e.target as Node)) onSchliessen()
    }
    // Verzögert anhängen, sonst fängt derselbe Tipp, der geöffnet hat, gleich
    // wieder das Schließen aus
    const uhr = setTimeout(() => {
      document.addEventListener('mousedown', beiKlick)
      document.addEventListener('touchstart', beiKlick)
    }, 0)
    return () => {
      clearTimeout(uhr)
      document.removeEventListener('mousedown', beiKlick)
      document.removeEventListener('touchstart', beiKlick)
    }
  }, [onSchliessen])

  const gefiltert = useMemo(() => {
    const begriff = suche.trim().toLowerCase()
    if (!begriff) return EMOJI_GRUPPEN

    const treffer = EMOJI_GRUPPEN
      .map(g => ({
        titel: g.titel,
        emojis: g.emojis.filter(e =>
          (EMOJI_STICHWORTE[e] ?? '').includes(begriff) || g.titel.toLowerCase().includes(begriff),
        ),
      }))
      .filter(g => g.emojis.length > 0)

    // Ohne Treffer lieber alles zeigen als eine leere Fläche
    return treffer.length > 0 ? treffer : EMOJI_GRUPPEN
  }, [suche])

  return (
    <div
      ref={feld}
      onClick={e => e.stopPropagation()}
      style={{
        marginTop: 8,
        borderRadius: 14,
        background: 'rgba(28,28,30,0.96)',
        border: '1px solid rgba(255,255,255,0.12)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <input
          value={suche}
          onChange={e => setSuche(e.target.value)}
          placeholder="Suchen – z.B. katze, herz, daumen"
          // Keine Autokorrektur: Sie macht aus "kot" gern etwas anderes
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          style={{
            // 16 Pixel ist nicht nur besser lesbar: Darunter zoomt Safari auf
            // dem iPhone beim Antippen ins Feld hinein.
            width: '100%', fontSize: 16, padding: '11px 12px', borderRadius: 10,
            border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', outline: 'none',
          }}
        />
      </div>

      <div style={{ maxHeight: 300, overflowY: 'auto', padding: '6px 8px 10px' }}>
        {gefiltert.map(gruppe => (
          <div key={gruppe.titel} style={{ marginTop: 6 }}>
            <p
              style={{
                fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)',
                margin: '6px 2px 5px',
              }}
            >
              {gruppe.titel}
            </p>
            {/* Sechs Spalten statt acht: Acht ergaben auf einem iPhone
                Felder von gut vierzig Pixeln, mit dem Emoji darin auf zwanzig.
                Sechs lassen jedem Feld genug Platz, um es sicher zu treffen. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
              {gruppe.emojis.map(emoji => (
                <button
                  key={`${gruppe.titel}-${emoji}`}
                  onClick={() => onWaehlen(emoji)}
                  aria-label={`Mit ${emoji} reagieren`}
                  style={{
                    fontSize: 26, lineHeight: 1, minHeight: 46, borderRadius: 10,
                    border: 'none', background: 'rgba(255,255,255,0.06)',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
