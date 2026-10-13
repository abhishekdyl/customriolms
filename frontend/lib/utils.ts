import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// The standard shadcn/ui helper — every ui/* component imports this.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
