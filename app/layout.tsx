import type { Metadata, Viewport } from "next";
import "./globals.css";

// ตั้งค่า Viewport ให้ล็อกขนาดหน้าจอและป้องกันการซูม (สำคัญมากสำหรับการทำแอปมือถือ)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // รองรับการแสดงผลเต็มขอบจอ (notch) บนมือถือรุ่นใหม่ๆ
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "JEARPOS", // ชื่อบน Title Bar ของเบราว์เซอร์
  description: "ระบบ POS และร้านค้าออนไลน์",
  manifest: "/manifest.json", // ชี้ไปที่ไฟล์ตั้งค่า PWA
  
  // ตั้งค่าสำหรับอุปกรณ์ Apple (iOS) ให้ทำตัวเป็นแอปพลิเคชัน (Standalone)
  appleWebApp: {
    capable: true, // ทำให้เป็น Web App เต็มจอ
    title: "JEARPOS", // ชื่อใต้ไอคอนเวลา Add to Home Screen บน iOS
    statusBarStyle: "default", // แถบสถานะด้านบนของ iOS
  },
  
  // กำหนดไอคอนสำหรับเบราว์เซอร์และ iOS
  icons: {
    icon: "/logo.png", // ไอคอนเริ่มต้น (Favicon)
    apple: [
      { url: "/logo.png", sizes: "512x512", type: "image/png" }, // ไอคอนสำหรับ iOS Home Screen
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      {/* เพิ่ม style ลงใน body เพื่อป้องกันการ scroll เด้ง (Bounce effect) บน iOS/Android */}
      <body className="overscroll-none h-[100dvh] w-full m-0 p-0 overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}