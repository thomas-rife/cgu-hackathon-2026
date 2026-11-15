import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FleetForward | Freight Planning",
  description: "Southern California freight route and disruption planning.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Served from Esri's CDN so the 340 KB theme and its fonts stay out of the build. Keep the version in sync with @arcgis/core in package.json. */}
        <link rel="stylesheet" href="https://js.arcgis.com/5.2.4/@arcgis/core/assets/esri/themes/light/main.css" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
