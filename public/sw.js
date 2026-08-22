// public/sw.js
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  console.log('Service Worker Activated for JEARPOS');
});

// หลอกเบราว์เซอร์ให้คิดว่าเรามีการจัดการระบบ Offline แล้ว
self.addEventListener('fetch', () => {
  return;
});