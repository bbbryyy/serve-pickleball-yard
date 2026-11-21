import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Serve Pickleball Yard — Book a court",
  description: "Book a pickleball court by the hour. Early bird, regular, and late night hours. Pay with GCash or Maya.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} ${oswald.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        {/* page views and visitors (Vercel Web Analytics; no cookies) */}
        <Analytics />
      </body>
    </html>
  );
}
