/**
 * AIVA Web App - Root Layout
 * Futuristic AI Operating System Interface
 */

import type { Metadata } from 'next';
import 'material-symbols/outlined.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'AIVA - Personal AI Operating System',
  description: 'Your intelligent virtual assistant for managing tasks, notes, and more',
  keywords: ['AI', 'assistant', 'tasks', 'automation', 'productivity'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@300;400;500;600;700;900&display=swap"
        />
      </head>
      <body className="bg-[#050505] text-on-background text-base min-h-screen selection:bg-primary/30 antialiased">
        <Providers>
          {children}
        </Providers>
        {/* Grain Overlay */}
        <div className="grain-overlay" />
      </body>
    </html>
  );
}
