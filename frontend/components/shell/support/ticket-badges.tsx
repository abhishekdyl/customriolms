"use client";
import { cn } from "@/lib/utils";
import {
  supportCategoryLabel, supportPriorityLabel,
  type SupportTicketPriority, type SupportTicketStatus, type SupportTicketCategory,
} from "@/lib/types";

const priorityStyle: Record<SupportTicketPriority, string> = {
  low: "bg-line-soft text-ink-faint",
  medium: "bg-primary-soft text-primary",
  high: "bg-amber-soft text-amber",
  urgent: "bg-danger-soft text-danger",
};

export function PriorityBadge({ priority }: { priority: SupportTicketPriority }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", priorityStyle[priority])}>
      {supportPriorityLabel[priority]}
    </span>
  );
}

export function StatusBadge({ status }: { status: SupportTicketStatus }) {
  return (
    <span
      className={cn(
        "flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        status === "open" ? "bg-amber-soft text-amber" : "bg-success-soft text-success"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "open" ? "bg-amber" : "bg-success")} />
      {status === "open" ? "Open" : "Resolved"}
    </span>
  );
}

export function CategoryBadge({ category }: { category: SupportTicketCategory }) {
  return (
    <span className="rounded-full bg-line-soft px-2 py-0.5 text-[10px] font-medium text-ink-faint">
      {supportCategoryLabel[category]}
    </span>
  );
}
