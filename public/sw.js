self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // ตอบสนองกลับด้วยการดึงข้อมูลผ่านเน็ตเวิร์กตามปกติ แต่ถ้าเน็ตหลุดจะไม่ให้เว็บพัง
  event.respondWith(
    fetch(event.request).catch(() => new Response('คุณกำลังออฟไลน์'))
  );
});