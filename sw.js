/* Service worker: necessário para notificações no celular (Android)
   e para abrir/focar o site quando o usuário toca na notificação. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
      const aberta = janelas.find(j => 'focus' in j);
      return aberta ? aberta.focus() : self.clients.openWindow('/');
    })
  );
});
