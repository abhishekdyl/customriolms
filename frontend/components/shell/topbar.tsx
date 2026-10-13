"use client";

import { Bell, Search, X } from "lucide-react";

export function Topbar({
  title,
  search,
  onSearch,
  placeholder = "Search…",
}: {
  title: string;
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 md:px-8 h-[60px] shrink-0 bg-surface border-b border-line">
      <h1 className="font-head text-[16px] font-medium text-ink">{title}</h1>
      <div className="flex items-center gap-3 md:gap-4">
        {onSearch && (
          <label className="flex items-center gap-2 border border-line rounded-[5px] px-3 py-1.5 md:w-[220px] focus-within:border-primary">
            <Search size={14} className="text-ink-faint shrink-0" />
            <input
              value={search ?? ""}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={placeholder}
              className="w-24 md:w-full bg-transparent outline-none text-[12.5px] text-ink placeholder:text-ink-faint"
            />
            {search ? (
              <button type="button" onClick={() => onSearch("")} aria-label="Clear search">
                <X size={13} className="text-ink-faint" />
              </button>
            ) : null}
          </label>
        )}
        <button type="button" aria-label="Notifications">
          <Bell size={17} className="text-ink-soft" />
        </button>
      </div>
    </div>
  );
}
