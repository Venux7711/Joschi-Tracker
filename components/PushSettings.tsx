'use client'

import { useEffect, useState } from 'react'
import { NOTIFICATION_TOPICS, type NotificationTopic } from '@/lib/notification-topics'

/** VAPID-Schlüssel liegt base64url vor, die Push-API will ein Uint8Array. */
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

type Device = {
  id: string
  endpoint: string
  topics: NotificationTopic[]
  label: string | null
  created_at: string
}

export default function PushSettings() {
  const [devices, setDevices] = useState<Device[]>([])
  const [myEndpoint, setMyEndpoint] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/push/settings')
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDevices(data.devices ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setSupported(false)
        setPermission('unsupported')
        setLoading(false)
        return
      }
      setPermission(Notification.permission)
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setMyEndpoint(sub?.endpoint ?? null)
      } catch { /* kein Abo auf diesem Gerät */ }
      load()
    }
    init()
  }, [])

  /**
   * Dieses Gerät anmelden. Früher lag der Knopf unten auf dem Dashboard – er
   * gehört zu den übrigen Benachrichtigungs-Einstellungen, nicht dorthin.
   */
  const subscribe = async () => {
    setBusy('subscribe'); setError(null); setNotice(null)
    try {
      const permission = await Notification.requestPermission()
      setPermission(permission)
      if (permission !== 'granted') {
        setError('Benachrichtigungen wurden abgelehnt.')
        setBusy(null)
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub),
      })
      if (!res.ok) { setError('Konnte nicht angemeldet werden.'); setBusy(null); return }
      setMyEndpoint(sub.endpoint)
      setNotice('Dieses Gerät bekommt jetzt Benachrichtigungen.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen')
    }
    setBusy(null)
  }

  const unsubscribe = async () => {
    if (!confirm('Dieses Gerät abmelden? Es bekommt dann gar keine Benachrichtigungen mehr.')) return
    setBusy('subscribe'); setError(null); setNotice(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setMyEndpoint(null)
      await load()
    } catch {
      setError('Abmelden fehlgeschlagen')
    }
    setBusy(null)
  }

  const patch = async (device: Device, body: Partial<Device>) => {
    setDevices(prev => prev.map(d => (d.id === device.id ? { ...d, ...body } : d)))
    const res = await fetch('/api/push/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: device.id, ...body }),
    })
    if (!res.ok) { setError('Änderung konnte nicht gespeichert werden'); load() }
  }

  const toggleTopic = (device: Device, topic: NotificationTopic) => {
    const topics = device.topics.includes(topic)
      ? device.topics.filter(t => t !== topic)
      : [...device.topics, topic]
    patch(device, { topics })
  }

  const test = async (device: Device) => {
    setBusy(`test-${device.id}`); setError(null); setNotice(null)
    const res = await fetch('/api/push/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: device.id }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(data.error ?? 'Test fehlgeschlagen'); load(); return }
    setNotice('Testmeldung verschickt.')
  }

  return (
    <div className="card overflow-hidden">
      <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.08)' }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em', color: '#1C1C1E' }}>
          Benachrichtigungen
        </h2>
        <p style={{ fontSize: 12, color: 'rgba(60,60,67,0.4)', marginTop: 2 }}>
          Pro Gerät wählbar, was ankommt
        </p>
      </div>

      {/* Status dieses Geräts – hier wird an- und abgemeldet */}
      {supported && permission !== 'denied' && (
        <div style={{ padding: '14px 20px', borderBottom: '0.5px solid rgba(60,60,67,0.07)' }} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1C1E' }}>
              {myEndpoint ? '✅ Dieses Gerät ist angemeldet' : '🔕 Dieses Gerät bekommt nichts'}
            </p>
            <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.4)', marginTop: 2 }}>
              {myEndpoint
                ? 'Welche Meldungen, stellst du unten ein'
                : 'Einmal erlauben, dann kommen die Meldungen auch bei geschlossener App'}
            </p>
          </div>
          <button
            onClick={myEndpoint ? unsubscribe : subscribe}
            disabled={busy === 'subscribe'}
            className={myEndpoint ? '' : 'pressable'}
            style={myEndpoint
              ? { fontSize: 12, color: 'rgba(60,60,67,0.45)', fontWeight: 600, flexShrink: 0 }
              : { fontSize: 13, fontWeight: 700, padding: '9px 15px', borderRadius: 12, background: 'var(--am-500, #f59e0b)', color: 'white', border: 'none', flexShrink: 0 }}
          >
            {busy === 'subscribe' ? '…' : myEndpoint ? 'Abmelden' : '🔔 Aktivieren'}
          </button>
        </div>
      )}

      {!supported && (
        <div style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 13, color: 'rgba(60,60,67,0.6)' }}>
            Dieser Browser unterstützt keine Benachrichtigungen. Auf dem iPhone muss die App
            zuerst über „Teilen → Zum Home-Bildschirm" hinzugefügt werden.
          </p>
        </div>
      )}

      {supported && permission === 'denied' && (
        <div style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 13, color: '#B45309' }}>
            Benachrichtigungen sind für diese Seite blockiert. In den Browser- bzw.
            iOS-Einstellungen wieder erlauben, danach hier neu laden.
          </p>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px 20px' }}><div className="h-5 bg-gray-100 rounded animate-pulse" /></div>
      ) : devices.length === 0 ? (
        <div style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 13, color: 'rgba(60,60,67,0.5)' }}>
            Noch kein Gerät angemeldet. Oben auf „Aktivieren" tippen – danach erscheint
            das Gerät hier und die einzelnen Meldungen lassen sich ein- und ausschalten.
          </p>
        </div>
      ) : (
        <div style={{ padding: '14px 20px' }} className="space-y-3">
          {devices.map(d => {
            const isMine = !!myEndpoint && d.endpoint === myEndpoint
            return (
              <div key={d.id} className="rounded-xl border" style={{ borderColor: isMine ? 'rgba(var(--am-600-rgb),0.35)' : 'rgba(60,60,67,0.12)', padding: 12 }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <input
                      value={d.label ?? ''}
                      onChange={e => setDevices(prev => prev.map(x => (x.id === d.id ? { ...x, label: e.target.value } : x)))}
                      onBlur={e => patch(d, { label: e.target.value })}
                      placeholder={isMine ? 'Dieses Gerät' : 'Gerät benennen…'}
                      style={{ fontSize: 14, fontWeight: 600, color: '#1C1C1E', border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
                    />
                    <p style={{ fontSize: 11, color: 'rgba(60,60,67,0.35)' }}>
                      {isMine ? '📱 dieses Gerät · ' : ''}
                      seit {new Date(d.created_at).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <button
                    onClick={() => test(d)}
                    disabled={busy === `test-${d.id}`}
                    style={{ fontSize: 11, color: 'var(--am-600)', fontWeight: 600, flexShrink: 0 }}
                  >
                    {busy === `test-${d.id}` ? '…' : 'Test'}
                  </button>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  {NOTIFICATION_TOPICS.map(t => {
                    const on = d.topics.includes(t.key)
                    return (
                      <button
                        key={t.key}
                        onClick={() => toggleTopic(d, t.key)}
                        title={t.hint}
                        style={{
                          fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 999,
                          background: on ? 'var(--am-500, #f59e0b)' : 'rgba(120,120,128,0.1)',
                          color: on ? 'white' : 'rgba(60,60,67,0.5)',
                        }}
                      >
                        {on ? '✓ ' : ''}{t.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div style={{ paddingTop: 4 }}>
            {NOTIFICATION_TOPICS.map(t => (
              <p key={t.key} style={{ fontSize: 11, color: 'rgba(60,60,67,0.35)', lineHeight: 1.6 }}>
                <b style={{ color: 'rgba(60,60,67,0.5)' }}>{t.label}:</b> {t.hint}
              </p>
            ))}
          </div>
        </div>
      )}

      {(error || notice) && (
        <div style={{ padding: '10px 20px 16px' }}>
          {error && <p className="text-sm text-red-600">⚠ {error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}
        </div>
      )}
    </div>
  )
}
