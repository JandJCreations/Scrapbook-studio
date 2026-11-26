import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/layout/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/layout/service-worker-registration";
import { ClientErrorReporter } from "@/components/common/client-error-reporter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scrapbook Studio",
  description:
    "Turn your photos and clips into a video with music.",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Scrapbook Studio",
  },
};

export const viewport: Viewport = {
  // Lets the app reach the rounded corners and home bar of an iPhone; bars near the edges pad themselves with the safe-area insets.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1a24" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={200}>
            {children}
            {/* On a phone, messages sit above the editor's tool bar (and the home bar) instead of covering it. */}
            <Toaster mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }} />
          </TooltipProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
        <ClientErrorReporter />
      </body>
    </html>
  );
}
