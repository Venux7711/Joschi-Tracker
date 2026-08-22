self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Joschi & Bella Tracker'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/dashboard' },
    vibrate: [200, 100, 200],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      const url = event.notification.data?.url || '/dashboard'

      // Ein offenes Fenster wiederverwenden und dorthin navigieren. Vorher
      // wurde nur fokussiert, wenn die URL zufällig schon passte – sonst ging
      // ein zweites Fenster auf und man landete nicht beim gemeinten Bild.
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            return client.navigate(url).then(function (c) { return (c || client).focus() })
          }
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
