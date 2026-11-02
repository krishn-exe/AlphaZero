/**
 * Bhu Rakshak - Firebase Cloud Messaging (Web Push) Service Worker
 * Handles background push notifications when the web application tab is inactive or closed.
 */

/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming background push payload
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Bhu Rakshak Alert', body: event.data.text() };
    }
  }

  const notification = data.notification || data;
  const title = notification.title || '🚨 Landslide Risk Alert - Bhu Rakshak';
  const options = {
    body: notification.body || 'Elevated landslide risk detected in your monitored region.',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: 'bhu-rakshak-landslide-alert',
    renotify: true,
    requireInteraction: true,
    data: {
      url: notification.click_action || notification.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle user clicking the push notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
