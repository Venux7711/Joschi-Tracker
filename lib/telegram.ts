/**
 * Telegram-Anbindung: ein Bot, mehrere Chats.
 *
 * Welche Meldungen es gibt und warum – abgeleitet aus dem tatsächlichen
 * Nutzungsverhalten, nicht geraten:
 *
 * - reminder  Abends, NUR wenn für heute noch kein Futter eingetragen ist.
 *             Bei 98 % Abdeckung wäre eine stumpfe Tageserinnerung Lärm.
 * - health    Erinnerung ans Befinden, wenn seit Tagen nichts erfasst wurde.
 *             Genau hier klafft die Lücke: Futter 98 %, Befinden ~25 %.
 * - morning   Was gab es gestern, wie war das Befinden.
 * - pantry    Vorrat wird knapp – bei ~400 g/Tag ist das vorhersagbar.
 * - diarrhea  Warnung, wenn zwei Tage in Folge Durchfall eingetragen ist.
 * - birthday  Geburtstagsgruß am Morgen.
 */
export const TELEGRAM_TOPICS = [
  { key: 'reminder', label: 'Erinnerung abends', hint: 'nur wenn heute noch kein Futter erfasst ist' },
  { key: 'health', label: 'Befinden-Erinnerung', hint: 'wenn mehrere Tage kein Eintrag kam' },
  { key: 'morning', label: 'Morgenmeldung', hint: 'was es gestern gab und wie es ging' },
  { key: 'pantry', label: 'Vorrat wird knapp', hint: 'rechtzeitig vor der letzten Dose' },
  { key: 'diarrhea', label: 'Durchfall-Warnung', hint: 'bei zwei Tagen in Folge' },
  { key: 'birthday', label: 'Geburtstag', hint: 'Gruß am Morgen des Geburtstags' },
] as const

export type TelegramTopic = (typeof TELEGRAM_TOPICS)[number]['key']

export const TOPIC_KEYS: TelegramTopic[] = TELEGRAM_TOPICS.map(t => t.key)

export function isTopic(value: unknown): value is TelegramTopic {
  return typeof value === 'string' && (TOPIC_KEYS as string[]).includes(value)
}

export type SendResult = { ok: true } | { ok: false; error: string }

/**
 * Schickt eine Nachricht. Fehler werden zurückgegeben statt geworfen – ein
 * blockierter Chat darf den restlichen Versand nicht abbrechen.
 */
export async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
): Promise<SendResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) {
      return { ok: false, error: data.description ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Netzwerkfehler' }
  }
}

/** Prüft Token und liefert den Bot-Namen – für "Verbindung testen". */
export async function getBotInfo(token: string): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return { ok: false, error: data.description ?? `HTTP ${res.status}` }
    return { ok: true, username: data.result?.username ?? 'unbekannt' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Netzwerkfehler' }
  }
}

/**
 * Holt Chats, die dem Bot geschrieben haben. Damit muss niemand seine Chat-ID
 * von Hand heraussuchen: Einmal "Hallo" an den Bot, dann hier auf Suchen.
 */
export async function getRecentChats(
  token: string,
): Promise<{ ok: true; chats: { chat_id: string; label: string }[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return { ok: false, error: data.description ?? `HTTP ${res.status}` }

    const seen = new Map<string, string>()
    for (const update of data.result ?? []) {
      const chat = update?.message?.chat ?? update?.my_chat_member?.chat
      if (!chat?.id) continue
      const name =
        chat.title ??
        [chat.first_name, chat.last_name].filter(Boolean).join(' ') ??
        chat.username ??
        String(chat.id)
      seen.set(String(chat.id), name || String(chat.id))
    }
    return { ok: true, chats: Array.from(seen, ([chat_id, label]) => ({ chat_id, label })) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Netzwerkfehler' }
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
