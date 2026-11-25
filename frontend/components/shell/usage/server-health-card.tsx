"use client";
import type { ReactNode } from "react";
import { Cpu, HardDrive, MemoryStick } from "lucide-react";
import type { ServerHealth } from "@/lib/types";
import { cn } from "@/lib/utils";

function levelStyle(percent: number): { bar: string; text: string } {
  if (percent >= 90) return { bar: "bg-danger", text: "text-danger" };
  if (percent >= 70) return { bar: "bg-amber", text: "text-amber" };
  return { bar: "bg-success", text: "text-success" };
}

function Gauge({ icon, label, percent, sub }: { icon: ReactNode; label: string; percent: number; sub: string }) {
  const style = levelStyle(percent);
  return (
    <div className="flex-1 rounded-xl border border-line-soft bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-soft">
          {icon} {label}
        </div>
        <span className={cn("text-[15px] font-semibold", style.text)}>{percent.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-soft">
        <div className={cn("h-full rounded-full transition-all", style.bar)} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-ink-faint">{sub}</p>
    </div>
  );
}

/** Platform-wide — one reading, not per-org (every org's traffic and
 * files are served by this same process/disk). See server_health_
 * service's docstring on the backend for why there's no history here,
 * just a live snapshot refreshed every 15s (see useServerHealth). */
export function ServerHealthCard({ health }: { health: ServerHealth }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row">
      <Gauge icon={<Cpu size={13} />} label="CPU" percent={health.cpu_percent} sub="Current load on the server process" />
      <Gauge
        icon={<MemoryStick size={13} />} label="Memory" percent={health.ram_percent}
        sub={`${(health.ram_used_mb / 1024).toFixed(1)} GB of ${(health.ram_total_mb / 1024).toFixed(1)} GB used`}
      />
      <Gauge
        icon={<HardDrive size={13} />} label="Disk" percent={health.disk_percent}
        sub={`${health.disk_used_gb} GB of ${health.disk_total_gb} GB used`}
      />
    </div>
  );
}
