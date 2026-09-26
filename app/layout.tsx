import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spelling Quest",
  description: "A Spelling Bee practice game built around full-word spelling."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
