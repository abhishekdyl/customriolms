"use client";
import { useSyncExternalStore } from "react";
import { getDebugEntries, subscribeDebugEntries, type DebugEntry } from "@/lib/debug-store";

const EMPTY: DebugEntry[] = [];

export function useDebugEntries(): DebugEntry[] {
  return useSyncExternalStore(subscribeDebugEntries, getDebugEntries, () => EMPTY);
}
