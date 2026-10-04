import type { CSSProperties } from 'react';
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppProviders } from '@/providers/app-providers';
import { siteConfig } from '@/config/site';
import './globals.css';

// Same weights the original app requested from Google Fonts. The adjusted Arial fallback is
// disabled so glyphs Geist lacks (→, ⌘, ✓…) fall back to the system fonts, as before.
const geistSans = Geist({ subsets: ['latin'], weight: ['400', '500', '600'], adjustFontFallback: false });
const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], adjustFontFallback: false });

// Turbopack still emits the adjusted fallback face, so expose only the primary family name.
const primaryFamily = (font: { style: { fontFamily: string } }) => font.style.fontFamily.split(',')[0].trim();

const fontVariables = {
  '--font-geist-sans': primaryFamily(geistSans),
  '--font-geist-mono': primaryFamily(geistMono),
} as CSSProperties;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: { icon: { url: '/DIGITALYCloud_Logo.png', type: 'image/png' } },
  openGraph: { images: siteConfig.ogImage },
  twitter: { card: 'summary_large_image', images: siteConfig.ogImage },
};

export const viewport: Viewport = {
  themeColor: '#070A12',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="dark" style={fontVariables}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
