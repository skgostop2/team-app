/*
  서비스 워커 — 푸시를 받아 알림으로 띄우고, 누르면 그 화면으로 간다.
  화면 파일은 캐시하지 않는다 (옛 화면이 남아 헷갈리는 일을 막는다).
*/
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "업무관리", body: "", url: "/tasks", kind: "" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (_) {
    if (event.data) data.body = event.data.text();
  }
  const urgent = data.kind === "지시" || data.kind === "공지";
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.id || undefined,
      renotify: false,
      requireInteraction: urgent,
      vibrate: urgent ? [200, 100, 200] : [100],
      data: { url: data.url || "/tasks" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/tasks";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
