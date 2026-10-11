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
      <body>{children}</body>
    </html>
  );
}
