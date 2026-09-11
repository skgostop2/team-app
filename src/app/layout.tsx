import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "팀원 업무관리 시스템",
  description: "팀 업무 지시, 진행률 관리, 공지, 대시보드를 위한 웹 기반 업무관리 시스템",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
