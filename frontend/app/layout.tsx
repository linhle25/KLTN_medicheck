import "./globals.css";
import type { Viewport } from "next";
import FrontendBootGate from "@/components/FrontendBootGate";
import MediAlertProvider from "@/components/MediAlertProvider";

export const metadata = {
  title: "MediCheck",
  description: "Nền tảng kiểm tra tương tác thuốc thông minh",
  icons: {
    icon: "/Bộ nhận diện y tế/1-cropped.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#005eb8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `html:not([data-frontend-ready="true"]) .mc-page{visibility:hidden!important}html:not([data-frontend-ready="true"]) body{overflow:hidden!important}.frontend-boot-gate{visibility:visible!important}`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){document.documentElement.removeAttribute("data-frontend-ready");try{var saved=localStorage.getItem("medicheck_theme");var theme=saved==="dark"||saved==="light"?saved:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;}catch(e){document.documentElement.dataset.theme="light";}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0"
          rel="stylesheet"
        />
      </head>
      <body>
        <MediAlertProvider>
          <FrontendBootGate />
          {children}
        </MediAlertProvider>
      </body>
    </html>
  );
}
