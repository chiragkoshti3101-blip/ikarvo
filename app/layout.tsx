import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Instrument_Serif, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { THEME_BOOT } from '@/components/ThemeToggle';

const display = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-display' });
const sans = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

// Canonical site origin for metadata. APP_URL is set per environment; fall back to the public domain.
function siteUrl(): string {
  const raw = (process.env.APP_URL || 'https://ikarvo.com').trim().replace(/\/+$/, '');
  try { return new URL(raw).origin; } catch { return 'https://ikarvo.com'; }
}
const APP_URL = siteUrl();
const TITLE = 'Ikarvo: build the product, then sell it';
const DESC = 'Prompt-to-app builder with live preview, GitHub and Vercel shipping, UGC and motion ad studio, and a marketing planner. One workspace.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: TITLE, template: '%s · Ikarvo' },
  description: DESC,
  applicationName: 'Ikarvo',
  category: 'technology',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: { type: 'website', locale: 'en_US', url: '/', siteName: 'Ikarvo', title: TITLE, description: DESC },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0f' },
  ],
};

const ORG_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Ikarvo',
  url: APP_URL,
  description: DESC,
  areaServed: 'US',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-US" suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_LD) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
