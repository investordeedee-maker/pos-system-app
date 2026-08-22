import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JEARPOS",
  description: "ระบบ POS และร้านค้าออนไลน์",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "JEARPOS", // ชื่อที่จะแสดงใต้ไอคอนบน iOS
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/logo.png",
    apple: [
      { url: "/logo.png", sizes: "512x512", type: "image/png" },
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
      <body>{children}</body>
    </html>
  );
}