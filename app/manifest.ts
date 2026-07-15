// app/manifest.ts
import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CampusSync',
    short_name: 'CampusSync',
    description: '学校生活を快適にする情報共有アプリ',
    start_url: '/',
    display: 'standalone', // これを指定すると、ブラウザのURLバーが消えてネイティブアプリのように表示されます
    background_color: '#f9fafb',
    theme_color: '#3b82f6',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}