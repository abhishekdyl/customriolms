"use client";
import { useEffect, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { MessageCircle, Loader2, Send, X } from "lucide-react";
import { useTeams } from "@/lib/hooks/use-teams";
import type { BroadcastPreview, BroadcastResult, BroadcastScope, BroadcastTarget } from "@/lib/notifications";

const inputCls = "w-full text-[13px] border border-line rounded-md px-2.5 py-2 outline-none focus:border-primary bg-surface";

/** Shared by Course Launch and Webinar/Live-session "Notify via
 * WhatsApp" actions (see backend's BroadcastTargetIn/resolve_broadcast_
 * targets) — same three picks either way: everyone in the org, one
 * team's members directly, or this course's/session's own enrolled
 * audience. `individualOption`, when given, adds a fourth fixed choice
 * for a hand-picked-list live class (no picker needed — it's just
 * whichever users that class itself already targets). */
export function WhatsAppNotifyModal({
  open, onClose, heading, helperText, courseOptionLabel, individualOption, defaultScope = "all",
  preview, send,
}: {
  open: boolean;
  onClose: () => void;
  heading: string;
  helperText: string;
  /** Label for the "course" scope option — omit to hide it entirely
   * (e.g. a webinar with no course attached). */
  courseOptionLabel?: string;
  individualOption?: { label: string; user_ids: string[] } | null;
  defaultScope?: BroadcastScope;
  preview: UseMutationResult<BroadcastPreview, unknown, BroadcastTarget>;
  send: UseMutationResult<BroadcastResult, unknown, BroadcastTarget>;
}) {
  const { data: teams = [] } = useTeams();
  const [scope, setScope] = useState<BroadcastScope>(defaultScope);
  const [teamId, setTeamId] = useState<string>("");
  const [result, setResult] = useState<BroadcastResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setScope(defaultScope);
    setTeamId(teams[0]?.id ?? "");
    setResult(null);
    preview.reset();
    send.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const target: BroadcastTarget =
    scope === "team" ? { scope: "team", team_id: teamId || null }
    : scope === "individual" ? { scope: "individual", user_ids: individualOption?.user_ids ?? [] }
    : { scope };

  const canPreview = scope !== "team" || !!teamId;
  const doPreview = () => { if (canPreview) preview.mutate(target); };
  const doSend = () => send.mutate(target, { onSuccess: (r) => setResult(r) });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-[460px] rounded-[12px] bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-primary" />
            <h3 className="text-[14.5px] font-semibold text-ink">{heading}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-paper"><X size={15} className="text-ink-faint" /></button>
        </div>
        <p className="mb-4 text-[12px] text-ink-faint">{helperText}</p>

        {result ? (
          <div className="rounded-md bg-primary-soft px-3 py-3 text-[13px] text-ink">
            Sent {result.sent}, failed {result.failed}, skipped {result.skipped} (no usable phone number).
          </div>
        ) : (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-[11.5px] text-ink-soft">Send to</label>
              <select className={inputCls} value={scope} onChange={(e) => { setScope(e.target.value as BroadcastScope); setResult(null); preview.reset(); }}>
                <option value="all">All active users in the org</option>
                <option value="team" disabled={teams.length === 0}>One team{teams.length === 0 ? " (no teams yet)" : ""}</option>
                {courseOptionLabel && <option value="course">{courseOptionLabel}</option>}
                {individualOption && <option value="individual">{individualOption.label}</option>}
              </select>
            </div>
            {scope === "team" && (
              <div className="mb-3">
                <select className={inputCls} value={teamId} onChange={(e) => { setTeamId(e.target.value); setResult(null); preview.reset(); }}>
                  <option value="" disabled>Choose a team…</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <button
              type="button" onClick={doPreview} disabled={!canPreview || preview.isPending}
              className="mb-3 w-full rounded-md border border-line py-2 text-[12.5px] font-medium text-ink-soft disabled:opacity-60"
            >
              {preview.isPending ? "Checking…" : "Check recipients"}
            </button>

            {preview.data && (
              <div className="mb-4 rounded-md bg-paper px-3 py-2.5 text-[12.5px] text-ink">
                <strong>{preview.data.recipient_count}</strong> {preview.data.recipient_count === 1 ? "user" : "users"} will be messaged.
                {preview.data.without_phone_count > 0 && (
                  <span className="text-ink-faint"> {preview.data.without_phone_count} of them have no phone number on file and will be skipped.</span>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3.5 py-2 text-[12.5px] text-ink-soft">Cancel</button>
              <button
                type="button" onClick={doSend} disabled={!preview.data || send.isPending}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
              >
                {send.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {send.isPending ? "Sending…" : "Send WhatsApp notification"}
              </button>
            </div>
            {send.isError && <p className="mt-2 text-[11.5px] text-danger">Couldn&apos;t send — try again.</p>}
          </>
        )}
      </div>
    </div>
  );
}
