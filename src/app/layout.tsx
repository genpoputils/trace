import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GenPopUtils Trace — AI-Powered Codebase Intelligence & Execution Tracing',
  description:
    'Searchable, interactive map of software systems. Statically analyze TypeScript and JavaScript repositories, trace function calls and data flow, inspect dependencies, and evaluate change impacts.',
  keywords: [
    'codebase intelligence',
    'execution tracing',
    'static analysis',
    'dependency graph',
    'call graph',
    'data flow',
    'change impact analysis',
    'GenPopUtils',
  ],
  authors: [{ name: 'GenPopUtils' }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
