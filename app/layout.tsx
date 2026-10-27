import type { Metadata } from "next";
// import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wayfind | Grok Bot Templates for Web3",
  description:
    "Download Wayfind Bot templates for Grok to analyze risk, manage portfolios, rebalance positions, and trade tokenized stocks on Solana.",
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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&family=Zen+Tokyo+Zoo&display=swap" rel="stylesheet" />
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
        {children}
      </body>
    </html>
  );
}
