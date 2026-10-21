import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // SCORM content is played in a sandboxed <iframe> whose own JS calls
  // `window.parent.API.LMSInitialize(...)` etc. directly and
  // synchronously — the actual contract every real SCORM package (and
  // every third-party LMS) expects. That only works when the iframe and
  // the page embedding it are the SAME origin: the browser's
  // same-origin policy blocks a cross-origin iframe from reading
  // properties off `window.parent` at all (the iframe sandbox's
  // `allow-same-origin` flag only keeps the iframe from being forced
  // into a unique opaque origin — it does NOT grant cross-origin access
  // to the parent's window object). The backend API normally lives on
  // its own origin (a different host, or just a different port in dev),
  // so without this rewrite the SCORM player's own `findAPI()` throws a
  // SecurityError and the package just sits on its own "loading…"
  // screen forever, never finding an LMS to talk to.
  //
  // This rewrite makes `/scorm-proxy/...` on the FRONTEND's own origin
  // transparently serve the backend's scorm-content route, so the
  // iframe's src — and everything the package's HTML/CSS/JS then
  // requests relatively from inside it — stays on this same origin the
  // whole time. See ScormPlayer, which builds its iframe src from this
  // same prefix.
  async rewrites() {
    return [
      {
        source: "/scorm-proxy/:courseId/:moduleId/:filePath*",
        destination: `${API_URL}/api/v1/courses/:courseId/modules/:moduleId/scorm-content/:filePath*`,
      },
    ];
  },
};

export default nextConfig;
