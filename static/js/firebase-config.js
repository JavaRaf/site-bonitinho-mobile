const firebaseConfig = {
  apiKey: "AIzaSyCszlDrXe1_PUEjS8rONvFEJqxSKlwx-eI",
  authDomain: "sitebonitinho-push.firebaseapp.com",
  projectId: "sitebonitinho-push",
  storageBucket: "sitebonitinho-push.firebasestorage.app",
  messagingSenderId: "702119963811",
  appId: "1:702119963811:web:13e99cae22b90d26152316",
};

const VAPID_KEY = "BMsrfmHZlJBcPN3bcEFCbnE85SsjOosYXS-vWLEopCK-U8fYBxLMT_lh1zUvaaXvn0e5KQUvJvrn3cC5gHCA2s8";

let firebaseApp = null;
let messaging = null;
let currentToken = null;

async function initFirebase() {
  if (firebaseApp) return;
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getMessaging } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
    firebaseApp = initializeApp(firebaseConfig);
    messaging = getMessaging(firebaseApp);
  } catch { /* ignore */ }
}

async function saveToken(token) {
  if (!token || token === currentToken) return;
  currentToken = token;
  try {
    await fetch("/api/push/subscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch { /* ignore */ }
}

export async function requestPushPermission() {
  await initFirebase();
  if (!messaging) return null;
  try {
    const { getToken, onTokenRefresh, onMessage } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    await saveToken(token);

    onTokenRefresh(messaging, async () => {
      try {
        const refreshed = await getToken(messaging, { vapidKey: VAPID_KEY });
        await saveToken(refreshed);
      } catch { /* ignore */ }
    });

    onMessage(messaging, (payload) => {
      const title = payload.data?.title || "MikanNet";
      const body = payload.data?.body || "";
      new Notification(title, { body, icon: "/static/svg/default-avatar.svg" });
      if (typeof refreshNotificationBadge === "function") refreshNotificationBadge();
    });

    return token;
  } catch { return null; }
}

export async function unsubscribePush() {
  await initFirebase();
  if (!messaging) return;
  try {
    const { getToken, deleteToken } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    }
    await deleteToken(messaging);
    currentToken = null;
  } catch { /* ignore */ }
}

export async function getPushStatus() {
  try {
    const res = await fetch("/api/push/status", { credentials: "include" });
    const data = await res.json();
    return data.enabled;
  } catch { return false; }
}
