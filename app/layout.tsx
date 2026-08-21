import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ระบบร้านค้าออนไลน์",
  description: "สั่งซื้อสินค้าออนไลน์ สะดวก รวดเร็ว",
  manifest: "/manifest.json", // อ้างอิงไฟล์ PWA Manifest
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Store",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}