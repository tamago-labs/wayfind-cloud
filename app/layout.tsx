import type { Metadata } from "next";
import ConfigureAmplify from "@/components/ConfigureAmplify";
// import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wayfind Cloud — Always-On AI Agents From $5/Month",
  description:
    "Hire AI Bots for research, coding, leads, and everyday operations. Each Bot remembers its context and works in the cloud, without an expensive bundled subscription. Free during early access.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&family=Zen+Tokyo+Zoo&family=JetBrains+Mono:wght@400;500;600&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&display=swap" rel="stylesheet" />
       {/* <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-51VBWDT3P2"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-51VBWDT3P2');
          `}
        </Script>*/}
      </head>
      <body className="font-sans">
        <ConfigureAmplify>{children}</ConfigureAmplify>
      </body>
    </html>
  );
}
