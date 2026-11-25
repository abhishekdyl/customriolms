"use client";
import { useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Database, MessagesSquare, Video } from "lucide-react";
import {
  CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useOrgUsageDetail } from "@/lib/hooks/use-usage-monitoring";
import { planLabel, planStyle, statusStyle } from "@/lib/org-display";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS = [7, 30, 90] as const;

// Matches app/globals.css's own CSS variables (--color-primary etc) —
// hardcoded here rather than read via var() because these feed SVG
// fill/stroke props inside a third-party chart library, where a plain
// hex string is the safest thing to hand it.
const CHART_COLORS = ["#3D5AFE", "#00C48C", "#FF8A00", "#FF3B5C", "#8C54FF", "#00B8D9"];

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-xl border border-line-soft bg-surface p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</div>
      <div>
        <p className="text-[11px] text-ink-faint">{label}</p>
        <p className="text-[15px] font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}

export default function OrgUsageDetailPage() {
  const params = useParams<{ orgId: string }>();
  const router = useRouter();
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(7);
  const { data, isLoading } = useOrgUsageDetail(params.orgId, days);

  if (isLoading || !data) {
    return <div className="p-8 text-[12.5px] text-ink-faint">Loading…</div>;
  }

  const userPercent = data.user_limit ? (data.user_count / data.user_limit) * 100 : 0;

  return (
    <div className="p-8">
      <button type="button" onClick={() => router.push("/usage-monitoring")} className="mb-4 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft hover:text-ink">
        <ArrowLeft size={14} /> Back to Usage Monitoring
      </button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-head text-xl text-ink">{data.org_name}</h1>
            <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-medium", planStyle[data.plan])}>{planLabel[data.plan]}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-medium", statusStyle[data.status])}>{data.status}</span>
          </div>
          <p className="mt-0.5 text-sm text-ink-faint">/{data.org_slug}</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-line-soft p-1">
          {RANGE_OPTIONS.map((d) => (
            <button
              key={d} type="button" onClick={() => setDays(d)}
              className={cn("rounded-md px-3 py-1.5 text-[12px] font-medium", days === d ? "bg-surface text-ink shadow-sm" : "text-ink-faint")}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={<Database size={16} />} label="Storage used" value={`${(data.storage_mb / 1024).toFixed(2)} / ${(data.storage_limit_mb / 1024).toFixed(0)} GB`} />
        <StatTile icon={<Database size={16} />} label="Seats used" value={`${data.user_count} / ${data.user_limit} (${userPercent.toFixed(0)}%)`} />
        <StatTile icon={<Video size={16} />} label="Live classes" value={`${data.live_class_count} · ${data.live_class_minutes} min`} />
        <StatTile icon={<MessagesSquare size={16} />} label="WhatsApp sent" value={`${data.whatsapp_messages}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-line-soft bg-surface p-4 lg:col-span-1">
          <h3 className="mb-3 text-[12.5px] font-semibold text-ink">Storage by type</h3>
          {data.storage_breakdown.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-ink-faint">No files uploaded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.storage_breakdown} dataKey="bytes" nameKey="type" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {data.storage_breakdown.map((entry, i) => (
                    <Cell key={entry.type} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${(Number(value) / (1024 * 1024)).toFixed(1)} MB`} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {data.storage_breakdown.map((entry, i) => (
              <span key={entry.type} className="flex items-center gap-1 text-[11px] text-ink-soft">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                {entry.type} ({(entry.bytes / (1024 * 1024)).toFixed(1)} MB)
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line-soft bg-surface p-4 lg:col-span-2">
          <h3 className="mb-3 text-[12.5px] font-semibold text-ink">Request load (API calls/day)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.request_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEFFB" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#A0A3BD" }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#A0A3BD" }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="value" name="Requests" stroke="#3D5AFE" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-line-soft bg-surface p-4 lg:col-span-3">
          <h3 className="mb-3 text-[12.5px] font-semibold text-ink">Active users/day</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.dau_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEFFB" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#A0A3BD" }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#A0A3BD" }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="value" name="Active users" stroke="#00C48C" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
