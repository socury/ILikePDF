import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ilikepdf — Private, in-browser PDF editor",
  description:
    "Edit PDFs in your browser. Add text and images, white-out content, rearrange pages. Files never leave your device.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
