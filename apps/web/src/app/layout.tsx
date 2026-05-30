import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Procurement Packet Comparator",
  description: "Secure document intake, comparison, and mismatch review for client billing packets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
