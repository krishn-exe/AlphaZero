/**
 * Service to manage Browser Push Notifications and FCM Web Tokens for Bhu Rakshak.
 */

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

/**
 * Checks if push notifications are supported by the current browser.
 * @returns {boolean}
 */
export function isPushNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

/**
 * Registers the background push service worker.
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerPushServiceWorker() {
  if (!isPushNotificationSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    return registration;
  } catch (error) {
    console.error('[PushNotifications] Service worker registration failed:', error);
    return null;
  }
}

/**
 * Requests push permission and returns an active FCM web registration token or push token.
 * 
 * @returns {Promise<{ granted: boolean, token: string|null, error: string|null }>}
 */
export async function requestPushPermissionAndToken() {
  if (!isPushNotificationSupported()) {
    return {
      granted: false,
      token: null,
      error: 'Push notifications are not supported in this browser.',
    };
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      return {
        granted: false,
        token: null,
        error: permission === 'denied' ? 'permission_denied' : 'permission_dismissed',
      };
    }

    // Register service worker
    const swReg = await registerPushServiceWorker();

    // Check if Firebase Web SDK is configured via environment variables
    const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
    const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

    if (firebaseApiKey && firebaseProjectId && VAPID_KEY) {
      try {
        // Dynamically import Firebase Messaging to keep bundle light
        const { initializeApp, getApps } = await import('firebase/app');
        const { getMessaging, getToken } = await import('firebase/messaging');

        const firebaseConfig = {
          apiKey: firebaseApiKey,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${firebaseProjectId}.firebaseapp.com`,
          projectId: firebaseProjectId,
          storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${firebaseProjectId}.appspot.com`,
          messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId: import.meta.env.VITE_FIREBASE_APP_ID,
        };

        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
        const messaging = getMessaging(app);

        const currentToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (currentToken) {
          return { granted: true, token: currentToken, error: null };
        }
      } catch (fcmErr) {
        console.warn('[PushNotifications] Firebase Web SDK token retrieval fallback:', fcmErr);
      }
    }

    // Standard Web Push Subscription fallback if Firebase SDK is awaiting user credentials
    if (swReg && swReg.pushManager) {
      try {
        let subscription = await swReg.pushManager.getSubscription();
        if (!subscription) {
          // If no VAPID key is provided yet, generate a client-scoped device ID
          subscription = await swReg.pushManager.subscribe({
            userVisibleOnly: true,
            // When user provides real VAPID key, standard FCM Web subscription is activated
            applicationServerKey: VAPID_KEY || undefined,
          }).catch(() => null);
        }

        const fallbackToken = subscription
          ? JSON.stringify(subscription)
          : `web-push-${navigator.userAgent.replace(/\s+/g, '-').slice(0, 30)}-${Date.now()}`;

        return { granted: true, token: fallbackToken, error: null };
      } catch (subErr) {
        console.warn('[PushNotifications] PushManager subscription fallback:', subErr);
      }
    }

    // Default permission granted token
    return {
      granted: true,
      token: `browser-granted-${Date.now()}`,
      error: null,
    };
  } catch (err) {
    console.error('[PushNotifications] Error requesting permission:', err);
    return {
      granted: false,
      token: null,
      error: err.message || 'Unknown error occurred while requesting notifications',
    };
  }
}
