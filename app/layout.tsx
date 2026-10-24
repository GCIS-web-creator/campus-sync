import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CampusAIChat from '@/components/CampusAIChat';

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
  themeColor: '#2B4FD8',
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, 
};

// 🌟 アプリの基本情報とPWA（iOSホーム画面対応）の設定
export const metadata: Metadata = {
  metadataBase: new URL('https://campus-sync-mocha.vercel.app'),
  title: 'CampusSync',
  description: '学校生活をひとつにつなぐ',
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CampusSync",
  },

  manifest: '/site.webmanifest',
  icons: { icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/favicon.svg', type: 'image/svg+xml' }], apple: '/apple-touch-icon.png' },
  openGraph: { title: 'CampusSync', description: '学校生活をひとつにつなぐ', locale: 'ja_JP', type: 'website', images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'CampusSync' }] },
  twitter: { card: 'summary_large_image', images: ['/og-image.png'] },
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
      <body className="min-h-full flex flex-col">
        {children}
        <CampusAIChat />
      </body>
    </html>
  );
}