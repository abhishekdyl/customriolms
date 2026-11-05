import type { Metadata } from "next";
import { Providers } from "./providers";
import { ImpersonationBanner } from "@/components/shell/impersonation-banner";
import { DebugBar } from "@/components/shell/debug-bar";
import "./globals.css";
// Video.js 10's default video skin — used by the learner's WatchPlayer
// (app/(learner)/learn/courses/[id]/page.tsx). Imported once here, same
// as globals.css, rather than per-component — Next.js App Router only
// allows a global (non-module) stylesheet import at this level.
import "@videojs/react/video/skin.css";

export const metadata: Metadata = {
  title: "Riosmart LMS",
  description: "Enterprise learning, powered by AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* suppressHydrationWarning here too — some browser extensions
         (antivirus web-protection add-ons, password managers) inject a
         marker attribute straight onto <body> before React hydrates.
         This only silences an *attribute* mismatch on this one element;
         it does NOT hide a real mismatch in anything rendered below it,
         so an actual bug in our own components still surfaces normally. */}
      <body suppressHydrationWarning>
        <Providers>
          <DebugBar />
          <ImpersonationBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
