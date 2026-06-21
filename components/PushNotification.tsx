'use client'

import { useState, useEffect } from 'react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export default function PushNotification() {
  const [status, setStatus] = useState<'unknown' | 'granted' | 'denied' | 'unsupported'>('unknown')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setStatus('unsupported')
      return
    }
    setStatus(Notification.permission as 'granted' | 'denied' | 'unknown')
    if (Notification.permission === 'granted') checkSubscription()
  }, [])

  const checkSubscription = async () => {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    setSubscribed(!!sub)
  }

  const subscribe = async () => {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('denied'); setLoading(false); return }
      setStatus('granted')

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })

      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) })
      setSubscribed(true)
    } catch (e) {
      console.error('Push subscribe error:', e)
    }
    setLoading(false)
  }

  const unsubscribe = async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  if (status === 'unsupported') return null

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-800 text-sm">Tägliche Benachrichtigung</p>
          <p className="text-xs text-gray-500">Jeden Morgen um 7 Uhr – Joscis Status</p>
        </div>
        {status === 'denied' ? (
          <span className="text-xs text-red-500">In Browser-Einstellungen erlauben</span>
        ) : subscribed ? (
          <button onClick={unsubscribe} disabled={loading} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
            {loading ? '…' : '✓ Aktiv'}
          </button>
        ) : (
          <button onClick={subscribe} disabled={loading} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors">
            {loading ? '…' : '🔔 Aktivieren'}
          </button>
        )}
      </div>
    </div>
  )
}
