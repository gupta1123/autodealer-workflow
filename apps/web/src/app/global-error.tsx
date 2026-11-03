"use client";

import { AppErrorScreen } from "@/components/errors/AppErrorScreen";
import "./globals.css";

// Replaces the whole document when the root layout itself crashes, so it needs its own html and body.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppErrorScreen boundary="app" error={error} />
      </body>
    </html>
  );
}
