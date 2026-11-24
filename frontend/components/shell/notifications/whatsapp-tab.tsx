"use client";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MessageCircle, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  useSaveWhatsAppSettings, useSaveWhatsAppTemplate, useTestWhatsApp, useWhatsAppSettings, useWhatsAppTemplates,
} from "@/lib/hooks/use-notifications";
import { whatsappKindLabel, type WhatsAppKind } from "@/lib/notifications";

const input = "w-full text-[13px] border border-line rounded-md px-2.5 py-2 outline-none focus:border-primary bg-surface";
const label = "text-[11.5px] text-ink-soft mb-1";

export function WhatsAppTab() {
  const { data: settings } = useWhatsAppSettings();
  const { data: templates } = useWhatsAppTemplates();
  const save = useSaveWhatsAppSettings();
  const saveTemplate = useSaveWhatsAppTemplate();
  const test = useTestWhatsApp();

  const [f, setF] = useState({ enabled: false, api_key: "", from_number: "" });
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, { template_name: string; lang_code: string }>>({});

  useEffect(() => {
    if (!settings || loaded) return;
    setF({ enabled: settings.enabled, api_key: "", from_number: settings.from_number });
    setLoaded(true);
  }, [settings, loaded]);

  useEffect(() => {
    if (!templates) return;
    setTemplateDrafts(Object.fromEntries(templates.map((t) => [t.kind, { template_name: t.template_name, lang_code: t.lang_code }])));
  }, [templates]);

  const doSave = () =>
    save.mutate(
      { enabled: f.enabled, api_key: f.api_key || undefined, from_number: f.from_number },
      { onSuccess: () => { setF((p) => ({ ...p, api_key: "" })); setSaved(true); setTimeout(() => setSaved(false), 2000); } },
    );

  const sendTest = () => { setResult(null); test.mutate(undefined, { onSuccess: (r) => setResult(r) }); };

  return (
    <div className="max-w-[640px]">
      <div className="mb-5 flex items-start gap-3 rounded-md border-l-[3px] border-primary bg-primary-soft px-4 py-3.5">
        <MessageCircle size={16} className="mt-0.5 shrink-0 text-primary" />
        <div className="text-[13px] text-ink">
          Send WhatsApp notifications through your own SendZen account — when a learner earns a certificate (automatic), and
          whenever you choose to notify a team or a course&apos;s enrolled users about a course launch or a live session (from
          that course&apos;s or session&apos;s own page).
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-[10px] border border-line bg-surface p-4">
        <div>
          <div className="text-[13.5px] font-medium text-ink">Enable WhatsApp notifications</div>
          <div className="text-[11.5px] text-ink-faint">Turn off to stop every WhatsApp send for this org, without losing your settings</div>
        </div>
        <Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} />
      </div>

      <div className="mb-5 rounded-[10px] border border-line bg-surface p-5">
        <p className="mb-3 text-[12.5px] font-medium text-ink">SendZen credentials</p>
        <div className="mb-4 grid grid-cols-1 gap-4">
          <div>
            <div className={label}>API key</div>
            <input
              className={input} type="password" value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })}
              placeholder={settings?.has_api_key ? "•••••••• (saved)" : "Your SendZen API key"}
            />
          </div>
          <div>
            <div className={label}>WhatsApp Business number (with country code, no +)</div>
            <input className={input} value={f.from_number} onChange={(e) => setF({ ...f, from_number: e.target.value })} placeholder="919876543210" />
          </div>
        </div>

        {result?.ok && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5">
            <CheckCircle2 size={14} className="text-success" /><span className="text-[12.5px] text-ink">{result.detail}</span>
          </div>
        )}
        {result && !result.ok && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2.5">
            <AlertCircle size={14} className="text-danger" /><span className="text-[12.5px] text-ink">{result.detail}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={doSave} disabled={save.isPending} className="rounded-md bg-primary px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-60">
            Save settings
          </button>
          <button type="button" onClick={sendTest} disabled={test.isPending || save.isPending} className="flex items-center gap-1.5 rounded-md border border-line px-4 py-2 disabled:opacity-60">
            {test.isPending ? <Loader2 size={13} className="animate-spin text-ink-soft" /> : <Send size={13} className="text-ink-soft" />}
            <span className="text-[12.5px] font-medium text-ink-soft">{test.isPending ? "Sending…" : "Send test message to my number"}</span>
          </button>
          {saved && <span className="text-[12px] text-success">Saved</span>}
          {save.isError && <span className="text-[12px] text-danger">Couldn&apos;t save.</span>}
        </div>
      </div>

      <div className="rounded-[10px] border border-line bg-surface p-5">
        <p className="mb-1 text-[12.5px] font-medium text-ink">Message templates</p>
        <p className="mb-4 text-[11.5px] text-ink-faint">
          Each row is one of your Meta-approved WhatsApp templates (created and approved in your SendZen dashboard — this app
          can&apos;t edit a template&apos;s own wording, only pick which approved template to use for each trigger).
        </p>
        <div className="flex flex-col gap-3">
          {(["certificate_earned", "course_launch", "webinar_scheduled"] as WhatsAppKind[]).map((kind) => {
            const draft = templateDrafts[kind] ?? { template_name: "", lang_code: "en_US" };
            const original = templates?.find((t) => t.kind === kind);
            const dirty = !original || original.template_name !== draft.template_name || original.lang_code !== draft.lang_code;
            return (
              <div key={kind} className="grid grid-cols-[1fr_120px_auto] items-end gap-2 border-t border-line-soft pt-3 first:border-t-0 first:pt-0">
                <div>
                  <div className={label}>{whatsappKindLabel[kind]} — template name</div>
                  <input
                    className={input} value={draft.template_name}
                    onChange={(e) => setTemplateDrafts((d) => ({ ...d, [kind]: { ...draft, template_name: e.target.value } }))}
                    placeholder="e.g. certificate_earned_v1"
                  />
                </div>
                <div>
                  <div className={label}>Language</div>
                  <input
                    className={input} value={draft.lang_code}
                    onChange={(e) => setTemplateDrafts((d) => ({ ...d, [kind]: { ...draft, lang_code: e.target.value } }))}
                    placeholder="en_US"
                  />
                </div>
                <button
                  type="button" disabled={!dirty || saveTemplate.isPending}
                  onClick={() => saveTemplate.mutate({ kind, ...draft })}
                  className="h-[34px] rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
