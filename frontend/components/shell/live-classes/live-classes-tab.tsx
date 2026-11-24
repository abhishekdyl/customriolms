"use client";
import { useState } from "react";
import { Plus, Trash2, Video, Pencil, ExternalLink, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconBtn, ConfirmRow } from "@/components/shell/recognition/ui";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import {
  useCreateLiveClass, useDeleteLiveClass, useJoinLiveClass, useLiveClasses, useUpdateLiveClass,
} from "@/lib/hooks/use-live-classes";
import { usePreviewWebinarNotify, useSendWebinarNotify } from "@/lib/hooks/use-notifications";
import { WhatsAppNotifyModal } from "@/components/shell/notifications/whatsapp-notify-modal";
import type { LiveClass, LiveClassInput, LiveClassStatus } from "@/lib/types";
import { LiveClassForm } from "./live-class-form";
import { ApiError } from "@/lib/api-client";

const statusStyle: Record<LiveClassStatus, string> = {
  scheduled: "text-ink-soft bg-line-soft",
  live: "text-emerald bg-emerald-soft",
  ended: "text-ink-faint bg-line-soft",
};
const statusLabel: Record<LiveClassStatus, string> = { scheduled: "Scheduled", live: "Live now", ended: "Ended" };

function targetLabel(lc: LiveClass): string {
  if (lc.target_scope === "all") return "All users";
  if (lc.target_scope === "team") return lc.team_name ? `Team: ${lc.team_name}` : "A team's users";
  if (lc.target_scope === "course") return lc.course_title ? `Course: ${lc.course_title}` : "A course's users";
  return `${lc.user_ids.length} hand-picked user(s)`;
}

function LiveClassRow({ lc, onEdit, onDelete }: { lc: LiveClass; onEdit: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const join = useJoinLiveClass();
  const remove = useDeleteLiveClass();
  const preview = usePreviewWebinarNotify(lc.id);
  const send = useSendWebinarNotify(lc.id);
  return (
    <div className="bg-surface border border-line rounded-[10px] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Video size={16} className="text-primary mt-0.5" />
          <div>
            <p className="text-[13.5px] font-medium text-ink">{lc.title}</p>
            <p className="text-[11.5px] text-ink-faint mt-0.5">
              {new Date(lc.scheduled_start).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              {" · "}{lc.duration_minutes} min · {lc.provider === "bigbluebutton" ? "BigBlueButton" : "Zoom"} · {targetLabel(lc)}
            </p>
            {lc.created_by_name && <p className="text-[11px] text-ink-faint mt-0.5">Scheduled by {lc.created_by_name}</p>}
          </div>
        </div>
        <span className={`text-[11px] font-medium px-2 py-1 rounded-full whitespace-nowrap ${statusStyle[lc.status]}`}>{statusLabel[lc.status]}</span>
      </div>

      {confirming ? (
        <div className="mt-3">
          <ConfirmRow label={`Delete "${lc.title}"? Students will no longer be able to join.`} busy={remove.isPending}
            onConfirm={() => { remove.mutate(lc.id); setConfirming(false); }} onCancel={() => setConfirming(false)} />
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-3">
          {lc.status !== "ended" && (
            <button
              type="button" disabled={join.isPending}
              onClick={() => join.mutate(lc.id, { onSuccess: (r) => window.open(r.join_url, "_blank") })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-[12px] font-medium disabled:opacity-60"
            >
              <ExternalLink size={12} /> Start / Join
            </button>
          )}
          {lc.recording_url && (
            <a href={lc.recording_url} target="_blank" rel="noreferrer" className="text-[12px] text-primary">View recording</a>
          )}
          <div className="flex-1" />
          <IconBtn icon={MessageCircle} label="Notify via WhatsApp" onClick={() => setNotifying(true)} />
          <IconBtn icon={Pencil} label="Edit" onClick={onEdit} />
          <IconBtn icon={Trash2} danger label="Delete" onClick={() => setConfirming(true)} />
        </div>
      )}
      {join.isError && <p className="text-[11.5px] text-danger mt-2">{(join.error as ApiError)?.message || "Couldn't get a join link."}</p>}

      <WhatsAppNotifyModal
        open={notifying}
        onClose={() => setNotifying(false)}
        heading={`Notify about "${lc.title}"`}
        helperText="Tells recipients this session is scheduled, with its date/time and a link to the Calendar page to join."
        courseOptionLabel={lc.course_title ? `This session's course: ${lc.course_title}` : undefined}
        individualOption={lc.target_scope === "individual" ? { label: `This session's hand-picked list (${lc.user_ids.length} users)`, user_ids: lc.user_ids } : null}
        defaultScope={lc.target_scope === "team" ? "team" : lc.target_scope === "course" ? "course" : lc.target_scope === "individual" ? "individual" : "all"}
        preview={preview}
        send={send}
      />
    </div>
  );
}

export function LiveClassesTab() {
  const { data: user } = useCurrentUser();
  const { data: classes = [], isLoading } = useLiveClasses();
  const create = useCreateLiveClass();
  const update = useUpdateLiveClass();
  const [editing, setEditing] = useState<LiveClass | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Org/Super Admin always gets "all"; a custom role scoped to their own
  // team doesn't — matches the backend's _enforce_team_scope exactly,
  // just so the dropdown doesn't offer an option the save would reject.
  const allowAllScope = user?.role === "org_admin" || user?.role === "super_admin";

  const open = editing !== null || creating;
  const close = () => { setEditing(null); setCreating(false); setFormError(null); };

  const submit = (body: LiveClassInput) => {
    setFormError(null);
    const onError = (e: unknown) => setFormError((e as ApiError)?.message || "Couldn't save this live class.");
    if (editing) update.mutate({ id: editing.id, ...body }, { onSuccess: close, onError });
    else create.mutate(body, { onSuccess: close, onError });
  };

  const sorted = [...classes].sort((a, b) => +new Date(a.scheduled_start) - +new Date(b.scheduled_start));

  return (
    <div className="max-w-[720px]">
      <p className="text-[12.5px] text-ink-faint mb-4">
        Schedule a live video session over BigBlueButton or Zoom. It shows up on the Calendar page for everyone it&apos;s sent to —
        all users in the org, one course&apos;s learners, or a hand-picked list.
      </p>
      <div className="flex flex-col gap-2.5">
        {isLoading && <div className="text-[12.5px] text-ink-faint">Loading…</div>}
        {sorted.map((lc) => (
          <LiveClassRow key={lc.id} lc={lc} onEdit={() => setEditing(lc)} onDelete={() => {}} />
        ))}
        <button
          type="button" onClick={() => setCreating(true)}
          className="flex items-center justify-center gap-1.5 py-2.5 border-[1.5px] border-dashed border-line rounded-[10px] active:opacity-70"
        >
          <Plus size={13} className="text-primary" />
          <span className="text-[12.5px] text-primary font-medium">Schedule a live class</span>
        </button>
      </div>

      <Dialog open={open} onOpenChange={(v) => !v && close()}>
        <DialogContent className="p-0">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit live class" : "Schedule a live class"}</DialogTitle>
          </DialogHeader>
          <LiveClassForm
            existing={editing} allowAllScope={allowAllScope}
            onSubmit={submit} onCancel={close}
            busy={create.isPending || update.isPending} error={formError}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
