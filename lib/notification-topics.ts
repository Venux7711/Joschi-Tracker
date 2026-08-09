/**
 * Die Themen der Benachrichtigungen – bewusst in einer eigenen Datei ohne
 * Server-Abhängigkeiten, damit die Einstellungs-Komponenten sie importieren
 * können, ohne web-push und den Supabase-Server-Client in den Browser-Bundle
 * zu ziehen.
 *
 * Welche Meldungen es gibt, ist aus dem tatsächlichen Verhalten abgeleitet:
 * Futter wird an 98 % der Tage erfasst, Befinden nur an rund einem Viertel.
 * Deshalb erinnert die App bei echten Lücken statt stur jeden Tag.
 */
export const NOTIFICATION_TOPICS = [
  { key: 'reminder', label: 'Futter-Erinnerung', hint: 'abends, nur wenn heute nichts erfasst ist' },
  { key: 'health', label: 'Befinden-Erinnerung', hint: 'nach 3 Tagen ohne Eintrag' },
  { key: 'morning', label: 'Morgenmeldung', hint: 'was es gestern gab und wie es ging' },
  { key: 'pantry', label: 'Vorrat wird knapp', hint: 'ab 4 Dosen im Haus' },
  { key: 'diarrhea', label: 'Durchfall-Warnung', hint: 'bei zwei Tagen in Folge' },
  { key: 'birthday', label: 'Geburtstag', hint: 'Gruß am Morgen' },
] as const

export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number]['key']

export const TOPIC_KEYS: NotificationTopic[] = NOTIFICATION_TOPICS.map(t => t.key)

export function isTopic(value: unknown): value is NotificationTopic {
  return typeof value === 'string' && (TOPIC_KEYS as string[]).includes(value)
}
