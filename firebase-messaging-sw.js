importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCszlDrXe1_PUEjS8rONvFEJqxSKlwx-eI",
  authDomain: "sitebonitinho-push.firebaseapp.com",
  projectId: "sitebonitinho-push",
  storageBucket: "sitebonitinho-push.firebasestorage.app",
  messagingSenderId: "702119963811",
  appId: "1:702119963811:web:13e99cae22b90d26152316",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title || "MikanNet";
  const body = payload.data?.body || "";
  self.registration.showNotification(title, {
    body,
    icon: "/static/svg/default-avatar.svg",
    badge: "/static/svg/default-avatar.svg",
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(self.location.origin) && "focus" in w) return w.focus();
      }
      return clients.openWindow("/");
    })
  );
});
