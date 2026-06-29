import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIP Loyalty Prototype",
  description: "Low-fidelity VIP loyalty system prototype (test assignment).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
