import type { Metadata } from "next";
import { Providers } from "./providers";
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
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
