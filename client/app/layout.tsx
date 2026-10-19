import type { Metadata } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { AppProviders } from "@/providers";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.defaultTitle,
    template: siteConfig.titleTemplate,
  },
  description: siteConfig.defaultDescription,
  applicationName: siteConfig.name,
  keywords: siteConfig.keywords,
  authors: [{ name: "Quizzy World", url: siteConfig.url }],
  creator: "Quizzy World",
  publisher: "Quizzy World",
  category: "games",
  classification: "Online Quiz Game & Real-Time Quiz Battles",
  alternates: {
    canonical: siteConfig.url,
  },
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
    images: [
      {
        url: "/images/quizzy-hero-logo.jpg",
        width: 600,
        height: 338,
        alt: "Quizzy World — Real-Time Multiplayer Quiz Game & Quiz Battles",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
    images: ["/images/quizzy-hero-logo.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/quizzy-favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/quizzy-favicon.svg",
    shortcut: "/quizzy-favicon.svg",
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" type="image/svg+xml" href="/quizzy-favicon.svg" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
