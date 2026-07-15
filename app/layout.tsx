import type { Metadata, Viewport } from "next";
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

// 🌟 PWA用のViewport設定（スマホでの意図しないダブルタップ拡大などを防ぐ）
export const viewport: Viewport = {
  themeColor: "#f9fafb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, 
};

// 🌟 アプリの基本情報とPWA（iOSホーム画面対応）の設定
export const metadata: Metadata = {
  title: "CampusSync",
  description: "学校生活を快適にする情報共有アプリ",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CampusSync",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 🌟 lang="en" を "ja" に変更（日本語のサイトとして正しく認識させるため）
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}