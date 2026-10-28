"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { useGoogleLogin, useGoogleRegister } from "@/lib/hooks/use-auth";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (resp: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

/** Loads the Google Identity Services script exactly once per page,
 * however many GoogleSignInButtons are mounted — a second <script> tag
 * for the same src is harmless but pointless, and GIS has its own
 * internal singleton anyway. */
let scriptPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        return;
      }
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Couldn't load Google Sign-In"));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Renders Google's own "Sign in with Google" button (via Google Identity
 * Services) and wires its credential straight into our own
 * /auth/google(/register) endpoints — never read by anything else, never
 * stored. Renders nothing at all when NEXT_PUBLIC_GOOGLE_CLIENT_ID isn't
 * set, so an org that hasn't configured Google sign-in simply doesn't
 * see the option, same as the backend 503ing GOOGLE_CLIENT_ID-less.
 *
 * mode="login" matches an existing account by email (404s if none
 * exists yet — surfaced here, not silently swallowed, since "no account"
 * for Google sign-in means something different than a wrong password).
 * mode="register" creates a brand-new org; orgName must be non-empty
 * (the caller — RegisterPage — validates this before even mounting the
 * button as enabled, since Google has no concept of org name for us to
 * fall back to).
 */
export function GoogleSignInButton(props: { mode: "login" } | { mode: "register"; orgName: string }) {
  const { mode } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const googleLogin = useGoogleLogin();
  const googleRegister = useGoogleRegister();

  // The GIS callback below is registered once (init only re-runs on
  // `mode` changing, never on every keystroke) but still needs whatever
  // org name is on screen AT THE MOMENT the person clicks the button —
  // not whatever it was when the button first mounted. A ref sidesteps
  // the stale-closure trap without re-initializing GIS on every keystroke.
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp) => {
            setError(null);
            const current = propsRef.current;
            if (current.mode === "register") {
              if (!current.orgName.trim()) {
                setError("Enter your organization name above first.");
                return;
              }
              googleRegister.mutate(
                { credential: resp.credential, org_name: current.orgName.trim() },
                { onError: (err) => setError(err instanceof ApiError ? err.message : "Something went wrong.") },
              );
            } else {
              googleLogin.mutate(resp.credential, {
                onError: (err) => setError(err instanceof ApiError ? err.message : "Something went wrong."),
              });
            }
          },
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline", size: "large", width: 380, text: mode === "register" ? "signup_with" : "signin_with",
        });
      })
      .catch(() => setError("Couldn't load Google Sign-In — check your connection."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init would just re-render the same button; props.orgName is read fresh inside the stable callback via the closure below instead
  }, [mode]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="w-full">
      <div ref={containerRef} className="flex w-full justify-center [&>div]:w-full" />
      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-danger">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}
