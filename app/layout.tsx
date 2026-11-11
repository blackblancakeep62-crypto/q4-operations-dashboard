import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "2026 Q4旺季经营总控台",
  description: "内部经营目标、历史节奏与风险核验",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
