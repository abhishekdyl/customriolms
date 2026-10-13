"use client";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send, Server } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useMyOrg } from "@/lib/hooks/use-orgs";
import { useSaveSmtp, useSmtp, useTestSmtp } from "@/lib/hooks/use-notifications";

const input = "w-full text-[13px] border border-line rounded-md px-2.5 py-2 outline-none focus:border-primary bg-surface";
const label = "text-[11.5px] text-ink-soft mb-1";

export function SmtpTab() {
  const { data: smtp } = useSmtp();
  const { data: org } = useMyOrg(true);
  const save = useSaveSmtp();
  const test = useTestSmtp();

  const [f, setF] = useState({
    use_custom: false, host: "", port: "587", encryption: "TLS" as "TLS" | "SSL" | "None",
    username: "", password: "", from_name: "", from_email: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    if (!smtp || loaded) return;
    setF({
      use_custom: smtp.use_custom, host: smtp.host, port: String(smtp.port), encryption: smtp.encryption,
      username: smtp.username, password: "",
      from_name: smtp.from_name || (org ? `${org.name} Learning` : ""),
      from_email: smtp.from_email || org?.contact_email || "",
    });
    setLoaded(true);
  }, [smtp, org, loaded]);

  const body = () => ({
    use_custom: f.use_custom, host: f.host, port: Number(f.port) || 587, encryption: f.encryption,
    username: f.username, password: f.password || undefined, from_name: f.from_name, from_email: f.from_email,
  });
  const doSave = (then?: () => void) =>
    save.mutate(body(), {
      onSuccess: () => { setF((p) => ({ ...p, password: "" })); setSaved(true); setTimeout(() => setSaved(false), 2000); then?.(); },
    });
  const sendTest = () => {
    setResult(null);
    // test uses the saved settings, so save first
    doSave(() => test.mutate(undefined, { onSuccess: (r) => setResult(r) }));
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="max-w-[560px]">
      <div className="flex items-start gap-3 px-4 py-3.5 mb-5 bg-primary-soft border-l-[3px] border-primary rounded-md">
        <Server size={16} className="text-primary mt-0.5 shrink-0" />
        <div className="text-[13px] text-ink">
          By default, reminder and invite emails send from Riosmart&apos;s shared mail servers. Turn this on to send from your own domain instead — better deliverability and your org&apos;s own &quot;From&quot; address.
        </div>
      </div>

      <div className="flex items-center justify-between p-4 mb-4 bg-surface border border-line rounded-[10px]">
        <div>
          <div className="text-[13.5px] text-ink font-medium">Use our own SMTP server</div>
          <div className="text-[11.5px] text-ink-faint">Send via your organization&apos;s mail server instead of Riosmart&apos;s default</div>
        </div>
        <Switch
          checked={f.use_custom}
          onCheckedChange={(v) => {
            setF({ ...f, use_custom: v });
            if (!v) save.mutate({ ...body(), use_custom: false }); // turning off applies immediately
          }}
        />
      </div>

      {f.use_custom && (
        <div className="bg-surface border border-line rounded-[10px] p-5">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2">
              <div className={label}>SMTP host</div>
              <input className={input} value={f.host} onChange={set("host")} placeholder="smtp.yourcompany.com" />
            </div>
            <div>
              <div className={label}>Port</div>
              <input className={input} value={f.port} onChange={set("port")} inputMode="numeric" />
            </div>
            <div>
              <div className={label}>Encryption</div>
              <select className={input} value={f.encryption} onChange={set("encryption")}>
                {["TLS", "SSL", "None"].map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <div className={label}>Username</div>
              <input className={input} value={f.username} onChange={set("username")} placeholder="smtp-user@yourcompany.com" />
            </div>
            <div>
              <div className={label}>Password</div>
              <input className={input} type="password" value={f.password} onChange={set("password")} placeholder={smtp?.has_password ? "•••••••• (saved)" : "••••••••"} />
            </div>
            <div>
              <div className={label}>From name</div>
              <input className={input} value={f.from_name} onChange={set("from_name")} />
            </div>
            <div>
              <div className={label}>From email</div>
              <input className={input} value={f.from_email} onChange={set("from_email")} />
            </div>
          </div>

          {result?.ok && (
            <div className="flex items-center gap-2 px-3 py-2.5 mb-3 bg-success-soft rounded-lg">
              <CheckCircle2 size={14} className="text-success" /><span className="text-[12.5px] text-ink">{result.detail}</span>
            </div>
          )}
          {result && !result.ok && (
            <div className="flex items-center gap-2 px-3 py-2.5 mb-3 bg-danger-soft rounded-lg">
              <AlertCircle size={14} className="text-danger" /><span className="text-[12.5px] text-ink">{result.detail}</span>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => doSave()} disabled={save.isPending} className="px-4 py-2 bg-primary rounded-md text-[12.5px] text-white font-medium disabled:opacity-60">
              Save settings
            </button>
            <button type="button" onClick={sendTest} disabled={test.isPending || save.isPending} className="flex items-center gap-1.5 px-4 py-2 border border-line rounded-md disabled:opacity-60">
              {test.isPending ? <Loader2 size={13} className="text-ink-soft animate-spin" /> : <Send size={13} className="text-ink-soft" />}
              <span className="text-[12.5px] text-ink-soft font-medium">{test.isPending ? "Sending…" : "Send test email"}</span>
            </button>
            {saved && <span className="text-[12px] text-success">Saved</span>}
            {save.isError && <span className="text-[12px] text-danger">Couldn&apos;t save.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
