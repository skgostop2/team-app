import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "팀원 업무관리 시스템",
  description: "팀 업무 지시, 진행률 관리, 공지, 대시보드를 위한 웹 기반 업무관리 시스템",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased" data-theme="sf">
      <head>
        {/* 글꼴 — 윈도우 기본(맑은 고딕)은 숫자가 뭉툭하다 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap"
        />
        {/*
          화면이 그려지기 전에 저장해 둔 밝기를 먼저 붙인다.
          이게 없으면 어두운 화면으로 들어갈 때 흰 화면이 한 번 번쩍인다.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("ui-theme");document.documentElement.dataset.theme=(t==="light")?"light":"sf";}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
