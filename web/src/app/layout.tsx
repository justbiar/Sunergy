import type { Metadata } from "next";
import { Noto_Serif, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-noto-serif",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sunergy — Decentralized Solar Protocol on Monad",
  description:
    "Earn rewards by powering the world with solar energy. Built on Monad for high-throughput, low-latency on-chain verification.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`h-full ${notoSerif.variable} ${ibmPlexMono.variable} ${inter.variable}`}
    >
      <body className="min-h-full flex flex-col bg-[#f6f3f1] text-[#000000]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
