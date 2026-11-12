import { LanguageRoot } from "@/components/i18n/Language";
import { NativeBridge } from "@/components/device/NativeBridge";
import { DeviceGate } from "@/components/device/DeviceGate";
import { ServiceWorker } from "@/components/pwa/InstallApp";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import QueryProvider from "@/components/providers/QueryProvider";

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

export const viewport: Viewport = { themeColor: "#4f806b" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="appearance"
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('ledgersync-appearance')||'light';if(['light','dark','system'].includes(t))document.documentElement.dataset.theme=t;var a=localStorage.getItem('ledgersync-accent')||'sage';if(['sage','blue','rose','amber','plum'].includes(a))document.documentElement.dataset.accent=a}catch{document.documentElement.dataset.theme='light'}`,
          }}
        />
      </head>
      <body className="antialiased">
        <LanguageRoot>
          <DeviceGate>
            <QueryProvider>{children}</QueryProvider>
          </DeviceGate>
          <ServiceWorker />
          <NativeBridge />
        </LanguageRoot>
      </body>
    </html>
  );
}
