import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'API Client — Postman Clone',
  description: 'A functional Postman-style API client: build, send, and inspect real HTTP requests.',
};

// Inline, render-blocking script that applies the saved theme before first paint
// to avoid a light/dark flash on load.
const noFlashScript = `(function(){try{var t=JSON.parse(localStorage.getItem('postman.theme'));if(t!=='light'&&t!=='dark')t='dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
