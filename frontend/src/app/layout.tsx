import { ServiceWorker } from "@/components/pwa/InstallApp";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/components/providers/QueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LedgerSync",
  description: "Personal finance, monthly budgets, and shared expenses",
  appleWebApp: {
    capable: true,
    title: "LedgerSync",
    statusBarStyle: "default",
  },
  icons: { apple: "/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#111827" };

import { GoogleOAuthProvider } from "@react-oauth/google";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "placeholder-client-id.apps.googleusercontent.com";

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GoogleOAuthProvider clientId={clientId}>
          <QueryProvider>
            {children}
            <ServiceWorker />
          </QueryProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
