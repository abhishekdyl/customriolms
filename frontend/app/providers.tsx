"use client";
import { useEffect, useState } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ApiError } from "@/lib/api-client";
import { pushDebugEntry } from "@/lib/debug-store";

/** Turns a failed query/mutation into a debug-bar entry — see
 * components/shell/debug-bar.tsx. Runs for every request regardless of
 * whether debug mode is actually on (cheap, capped — see debug-store);
 * DebugBar itself decides whether to show anything. */
function reportToDebugBar(error: unknown) {
  if (error instanceof ApiError) {
    pushDebugEntry({
      level: error.status >= 500 ? "error" : "warning",
      message: error.method && error.path ? `${error.method} ${error.path} → ${error.status}` : `Request failed → ${error.status}`,
      detail: error.message,
    });
  } else if (error instanceof Error) {
    pushDebugEntry({ level: "error", message: error.name || "Error", detail: error.message });
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
        queryCache: new QueryCache({ onError: reportToDebugBar }),
        mutationCache: new MutationCache({ onError: reportToDebugBar }),
      })
  );

  // Anything that escapes React entirely (a render-time throw outside an
  // error boundary, an unhandled promise rejection) — same idea as the
  // query/mutation capture above, just for everything else. Always
  // listening, same reasoning as above.
  useEffect(() => {
    const onError = (e: ErrorEvent) => pushDebugEntry({ level: "error", message: e.message, detail: e.filename ? `${e.filename}:${e.lineno}` : undefined });
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      pushDebugEntry({
        level: "error",
        message: "Unhandled promise rejection",
        detail: reason instanceof Error ? reason.message : String(reason),
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
