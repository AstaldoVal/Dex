import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anatomy Explorer — Brain & Muscles",
  description:
    "Interactive 3D anatomy: brain regions, shoulder muscles, lumbar muscles — linked to Brain Protocol.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
