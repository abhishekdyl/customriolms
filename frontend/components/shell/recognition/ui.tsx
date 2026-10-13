"use client";
import type { ComponentType } from "react";

export function IconBtn({
  icon: Icon, onClick, danger, label,
}: { icon: ComponentType<{ size?: number; className?: string }>; onClick: () => void; danger?: boolean; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="p-1.5 rounded-md hover:bg-line-soft">
      <Icon size={14} className={danger ? "text-danger" : "text-ink-soft"} />
    </button>
  );
}

export function ConfirmRow({
  label, onConfirm, onCancel, busy,
}: { label: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  return (
    <div className="flex items-center gap-3 flex-1 px-3 py-2.5 bg-danger-soft rounded-md">
      <span className="text-[12px] text-ink flex-1">{label}</span>
      <button type="button" disabled={busy} onClick={onConfirm} className="px-3 py-1.5 rounded-[5px] bg-danger text-white text-[11.5px] font-medium disabled:opacity-60">
        Delete
      </button>
      <button type="button" onClick={onCancel} className="text-[11.5px] text-ink-soft">Cancel</button>
    </div>
  );
}
