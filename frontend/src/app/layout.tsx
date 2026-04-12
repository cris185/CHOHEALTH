import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AuthProvider } from "@/context/AuthContext";
import Header from "@/components/Header";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CHO Health",
  description: "Medical appointment management system",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          BACK NAVIGATION HANDLER — runs BEFORE React hydrates.

          When a user navigates to Stripe/PayPal via `window.location.href` and
          presses the browser back button, two things can happen:

          1) bfcache restoration (Chrome/Firefox/Safari in production): the
             page is restored frozen, React effects do NOT re-run, and any
             `loading` state from before the navigation stays stuck. We detect
             this with `pageshow.persisted === true`.

          2) Plain back navigation (always in `next dev` because the HMR
             WebSocket disables bfcache): the navigation type reported by the
             Performance API is `'back_forward'`. The page may be served from
             the HTTP cache with stale JS state — same stuck-loading symptom.

          In BOTH cases we force a single hard reload so React remounts with
          clean state and fresh data from the API. The `__cho_bf_reloading__`
          flag in sessionStorage prevents an infinite reload loop: it is set
          right before reload, and cleared on the very next non-bf navigation
          (the reload itself reports type='reload', not 'back_forward').
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var n=performance.getEntriesByType('navigation')[0];var t=n?n.type:'';var k='__cho_bf_reloading_at__';var raw=sessionStorage.getItem(k);var ts=raw?parseInt(raw,10):0;var fresh=ts&&(Date.now()-ts<10000);if(t==='back_forward'&&!fresh){sessionStorage.setItem(k,String(Date.now()));window.location.reload();return;}sessionStorage.removeItem(k);window.addEventListener('pageshow',function(e){if(e.persisted){sessionStorage.removeItem(k);window.location.reload();}});}catch(_){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <Header />
            {children}
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}