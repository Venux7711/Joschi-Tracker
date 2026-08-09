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
