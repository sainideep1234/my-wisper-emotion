import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Wisper Emotion - Voice & Emotion AI Desktop App for macOS',
  description:
    'Real-time voice dictation and acoustic emotion intelligence engine for macOS. Download the local DMG app and dictate anywhere on autopilot.',
  keywords: [
    'Electron app',
    'Wisper Emotion',
    'macOS Dictation',
    'AI Voice App',
    'Speech to Text',
    'Whisper Local Models',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark antialiased`}>
      <body className="min-h-screen bg-[#030712] text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
