/**
 * AIVA Web App - Root Layout
 * Futuristic AI Operating System Interface
 */

import type { Metadata } from 'next';
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
