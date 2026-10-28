"use client";
import { useEffect, useState } from "react";
import { Server, ShieldQuestion, Wand2, UserCog, Send, Loader2, CheckCircle2, AlertCircle, Building2, Clock, Check, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { usePlatformSettings, useUpdatePlatformSettings, useSuperAdmins } from "@/lib/hooks/use-orgs";
import {
  useDecideSmtpRequest, usePlatformEmailLog, usePlatformSmtp, usePlatformSmtpRequests, useSavePlatformSmtp, useTestPlatformSmtp,
} from "@/lib/hooks/use-platform-smtp";
import { useDraft } from "@/lib/hooks/use-draft";
import { SaveBar } from "@/components/ui/save-bar";

const PORT_ENCRYPTION_HINTS: Record<string, "TLS" | "SSL"> = { "465": "SSL", "587": "TLS", "25": "TLS", "2525": "TLS" };

type TabId = "email" | "registration" | "ai" | "superadmins";

const tabs: { id: TabId; label: string; icon: typeof Server }[] = [
  { id: "email", label: "Email & Notifications", icon: Server },
  { id: "registration", label: "Registration", icon: ShieldQuestion },
  { id: "ai", label: "AI Configuration", icon: Wand2 },
  { id: "superadmins", label: "Super Admins", icon: UserCog },
];

// ---------------------------------------------------------------------------
// Email & Notifications — the platform's own shared SMTP (Tier 1) plus the
// queue of orgs asking to borrow it (Tier 3). An org's own SMTP (Tier 2) is
// configured on that org's side, under Settings ▸ Notifications ▸ SMTP.
// ---------------------------------------------------------------------------
function EmailNotificationsTab() {
  const { data: smtp, isLoading } = usePlatformSmtp();
  const save = useSavePlatformSmtp();
  const test = useTestPlatformSmtp();

  const [f, setF] = useState({
    host: "", port: "587", encryption: "TLS" as "TLS" | "SSL" | "None",
    username: "", password: "", from_name: "Riosmart LMS", from_email: "no-reply@riosmartlms.com",
  });
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    if (!smtp || loaded) return;
    setF({
      host: smtp.host, port: String(smtp.port), encryption: smtp.encryption, username: smtp.username,
      password: "", from_name: smtp.from_name || "Riosmart LMS", from_email: smtp.from_email || "no-reply@riosmartlms.com",
    });
    setLoaded(true);
  }, [smtp, loaded]);

  const body = () => ({
    host: f.host, port: Number(f.port) || 587, encryption: f.encryption,
    username: f.username, password: f.password || undefined, from_name: f.from_name, from_email: f.from_email,
  });
  const doSave = () =>
    save.mutate(body(), {
      onSuccess: () => { setF((p) => ({ ...p, password: "" })); setSaved(true); setTimeout(() => setSaved(false), 2000); },
    });
  const sendTest = () => {
    setResult(null);
    save.mutate(body(), { onSuccess: () => test.mutate(undefined, { onSuccess: (r) => setResult(r) }) });
  };
  const setPort = (e: React.ChangeEvent<HTMLInputElement>) => {
    const port = e.target.value;
    const hint = PORT_ENCRYPTION_HINTS[port.trim()];
    setF((p) => ({ ...p, port, encryption: hint ?? p.encryption }));
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-5 flex items-start gap-3 rounded-lg border-l-[3px] border-primary bg-primary-soft px-4 py-3.5">
        <Server className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <p className="text-[13px] text-ink">
          Org Admins set up their own SMTP from their org&apos;s Notifications settings. An org with no mail server of its
          own can ask to borrow this one instead — nothing sends through it for that org until you approve the request below.
        </p>
      </div>

      <section className="mb-6 rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3.5 font-head text-sm text-ink">Riosmart shared SMTP</h2>
        {isLoading ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="mb-1.5 block">SMTP host</Label>
                <Input value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="smtp.riosmartlms.com" />
              </div>
              <div>
                <Label className="mb-1.5 block">Port</Label>
                <Input value={f.port} onChange={setPort} inputMode="numeric" />
              </div>
              <div>
                <Label className="mb-1.5 block">Encryption</Label>
                <select
                  value={f.encryption}
                  onChange={(e) => setF({ ...f, encryption: e.target.value as "TLS" | "SSL" | "None" })}
                  className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus-visible:border-primary"
                >
                  {["TLS", "SSL", "None"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1.5 block">Username</Label>
                <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1.5 block">Password</Label>
                <Input
                  type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
                  placeholder={smtp?.has_password ? "•••••••• (saved)" : "••••••••••"}
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Default &quot;From&quot; name</Label>
                <Input value={f.from_name} onChange={(e) => setF({ ...f, from_name: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1.5 block">Default &quot;From&quot; email</Label>
                <Input value={f.from_email} onChange={(e) => setF({ ...f, from_email: e.target.value })} />
              </div>
            </div>

            {result?.ok && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="text-[12.5px] text-ink">{result.detail}</span>
              </div>
            )}
            {result && !result.ok && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2.5">
                <AlertCircle className="h-3.5 w-3.5 text-danger" />
                <span className="text-[12.5px] text-ink">{result.detail}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={doSave} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save settings"}</Button>
              <Button variant="secondary" onClick={sendTest} disabled={test.isPending || save.isPending}>
                {test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {test.isPending ? "Sending…" : "Send test email"}
              </Button>
              {saved && <span className="text-xs text-success">Saved</span>}
              {save.isError && <span className="text-xs text-danger">Couldn&apos;t save.</span>}
            </div>
          </>
        )}
      </section>

      <PlatformFallbackRequestsQueue />
      <PlatformEmailLogSection />
    </div>
  );
}

/** "Kis ko kab kaunsa mail gaya" across every org on the platform —
 * which org, recipient, subject, which SMTP it went through, and whether
 * it actually sent. Newest first. */
function PlatformEmailLogSection() {
  const { data: rows, isLoading } = usePlatformEmailLog();

  const statusBadge = (status: string) => {
    if (status === "sent") return <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-[10.5px] font-semibold text-success">Sent</span>;
    if (status === "failed") return <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[10.5px] font-semibold text-danger">Failed</span>;
    return <span className="rounded-full bg-paper px-2.5 py-0.5 text-[10.5px] font-semibold text-ink-faint">Not sent</span>;
  };

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line-soft px-4 py-3.5">
        <span className="font-head text-[14.5px] text-ink">Sent mail log (all orgs)</span>
      </div>
      <table className="w-full text-left text-[12.5px]">
        <thead>
          <tr className="bg-line-soft text-[11px] text-ink-faint">
            <th className="px-4 py-2 font-medium">Org</th>
            <th className="px-4 py-2 font-medium">To</th>
            <th className="px-4 py-2 font-medium">Subject</th>
            <th className="px-4 py-2 font-medium">Via</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">When</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <tr><td colSpan={6} className="px-4 py-4 text-center text-ink-faint">Loading…</td></tr>}
          {!isLoading && !rows?.length && <tr><td colSpan={6} className="px-4 py-4 text-center text-ink-faint">No emails sent yet.</td></tr>}
          {rows?.map((r) => (
            <tr key={r.id} className="border-t border-line-soft">
              <td className="px-4 py-2.5 text-ink">{r.org_name}</td>
              <td className="px-4 py-2.5 text-ink-soft">{r.to_addr}</td>
              <td className="max-w-[200px] truncate px-4 py-2.5 text-ink-soft" title={r.subject}>{r.subject}</td>
              <td className="px-4 py-2.5 text-ink-faint">{r.source === "platform" ? "Platform SMTP" : r.source === "org" ? "Org's own SMTP" : "—"}</td>
              <td className="px-4 py-2.5">{statusBadge(r.status)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-ink-faint">{new Date(r.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Super Admin's approval queue — every org that has ever asked to borrow
 * the platform SMTP, newest first, with Approve/Deny for anything pending. */
function PlatformFallbackRequestsQueue() {
  const { data: requests, isLoading } = usePlatformSmtpRequests();
  const decide = useDecideSmtpRequest();

  const statusBadge = (status: string) => {
    if (status === "approved") return <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-[10.5px] font-semibold text-success">Approved</span>;
    if (status === "denied") return <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[10.5px] font-semibold text-danger">Denied</span>;
    return (
      <span className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-0.5 text-[10.5px] font-semibold text-ink-faint">
        <Clock size={10} /> Pending
      </span>
    );
  };

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line-soft px-4 py-3.5">
        <span className="font-head text-[14.5px] text-ink">Requests to use the platform SMTP</span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        {isLoading && <p className="px-2 py-2 text-sm text-ink-faint">Loading…</p>}
        {requests?.map((r) => (
          <div key={r.org_id} className="flex items-center gap-3 px-2 py-2">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
            <span className="flex-1 text-sm text-ink">{r.org_name}</span>
            {statusBadge(r.status)}
            {r.status === "requested" && (
              <div className="ml-2 flex items-center gap-1.5">
                <button
                  onClick={() => decide.mutate({ orgId: r.org_id, approve: true })}
                  disabled={decide.isPending}
                  title="Approve"
                  className="rounded-md bg-success-soft p-1.5 text-success disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => decide.mutate({ orgId: r.org_id, approve: false })}
                  disabled={decide.isPending}
                  title="Deny"
                  className="rounded-md bg-danger-soft p-1.5 text-danger disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        {!isLoading && !requests?.length && <p className="px-2 py-2 text-sm text-ink-faint">No requests yet.</p>}
      </div>
    </section>
  );
}

function RegistrationTab() {
  const { data: settings, isLoading } = usePlatformSettings();
  const updateSettings = useUpdatePlatformSettings();
  const serverValue = settings ? { allow_self_serve_signup: settings.allow_self_serve_signup } : undefined;
  const { draft, setDraft, dirty, cancel } = useDraft(serverValue);
  const [saved, setSaved] = useState(false);

  return (
    <div className="max-w-2xl">
      <section className="mb-5 rounded-xl border border-line bg-surface p-5">
        {isLoading || !draft ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-ink">Allow public self-service sign-up</div>
              <div className="mt-0.5 max-w-md text-xs text-ink-faint">
                When on, anyone can create a brand-new organization from the &quot;Create an account&quot; link on the login page.
              </div>
            </div>
            <Switch
              checked={draft.allow_self_serve_signup}
              onCheckedChange={(checked) => setDraft({ allow_self_serve_signup: checked })}
            />
          </div>
        )}
      </section>
      <div className="flex items-start gap-3 rounded-lg border-l-[3px] border-primary bg-primary-soft px-4 py-3.5">
        <ShieldQuestion className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <p className="text-[13px] text-ink">
          Anyone with the login page URL can spin up a new org right now. Turn this off if you&apos;d rather every org go
          through Riosmart directly — you can still create them yourself from the Organizations page.
        </p>
      </div>
      <SaveBar
        dirty={dirty}
        saving={updateSettings.isPending}
        savedFlash={saved}
        onCancel={cancel}
        onSave={() => updateSettings.mutate(draft!, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } })}
        className="mt-4 rounded-xl border-t-0"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Configuration — LAYOUT ONLY, same reasoning as Email & Notifications:
// no AiSettings model/endpoint on the backend yet (the actual Claude API
// key is currently read from backend env vars, not editable per platform
// admin here). This tab is local state so the screen is fully clickable
// for review, but Save/Test don't call anything real yet.
// ---------------------------------------------------------------------------
const modelOptions = ["Claude Opus 5", "Claude Sonnet 5", "Claude Haiku 4.5"];

function AiConfigurationTab() {
  const [enabled, setEnabled] = useState(true);
  const [provider, setProvider] = useState("Anthropic");
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState({
    contentGen: "Claude Sonnet 5",
    tutor: "Claude Sonnet 5",
    insights: "Claude Haiku 4.5",
  });

  const testConnection = () => {
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTesting(false);
      setTestResult(apiKey.length > 8 ? "success" : "error");
    }, 900);
  };
  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl">
      <section className="mb-4 flex items-center justify-between rounded-xl border border-line bg-surface p-4">
        <div>
          <div className="text-sm font-medium text-ink">Enable AI features platform-wide</div>
          <div className="mt-0.5 text-xs text-ink-faint">Content generation, the learning assistant, and insight summaries all depend on this.</div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </section>

      {enabled && (
        <>
          <section className="mb-4 rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-3.5 font-head text-sm text-ink">API connection</h2>
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block">Provider</Label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus-visible:border-primary"
                >
                  {["Anthropic", "OpenAI", "Azure OpenAI"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1.5 block">API key</Label>
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" />
              </div>
            </div>

            {testResult === "success" && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="text-[12.5px] text-ink">Connected — key is valid.</span>
              </div>
            )}
            {testResult === "error" && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2.5">
                <AlertCircle className="h-3.5 w-3.5 text-danger" />
                <span className="text-[12.5px] text-ink">Couldn&apos;t verify this key.</span>
              </div>
            )}

            <Button variant="secondary" onClick={testConnection} disabled={testing}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {testing ? "Testing…" : "Test connection"}
            </Button>
          </section>

          <section className="mb-4 rounded-xl border border-line bg-surface p-5">
            <h2 className="font-head text-sm text-ink">Model per feature</h2>
            <p className="mb-3.5 mt-0.5 text-xs text-ink-faint">Trade off quality vs. cost independently for each AI feature.</p>

            {(
              [
                ["contentGen", "Content generation", "Course objectives & quiz drafting"],
                ["tutor", "Learning assistant", "The chat tutor learners talk to"],
                ["insights", "Insights & gap analysis", "Dashboard summaries, skill-gap ranking"],
              ] as const
            ).map(([key, label, hint]) => (
              <div key={key} className="flex items-center justify-between border-b border-line-soft py-3 last:border-0">
                <div>
                  <div className="text-[13px] font-medium text-ink">{label}</div>
                  <div className="text-[11px] text-ink-faint">{hint}</div>
                </div>
                <select
                  value={models[key]}
                  onChange={(e) => setModels({ ...models, [key]: e.target.value })}
                  className="h-9 rounded-lg border border-line bg-surface px-2.5 text-xs outline-none focus-visible:border-primary"
                >
                  {modelOptions.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
            ))}
          </section>

          <div className="flex items-center gap-3">
            <Button onClick={save}>Save configuration</Button>
            {saved && <span className="text-xs text-success">Saved</span>}
          </div>
        </>
      )}
    </div>
  );
}

function SuperAdminsTab() {
  const { data: superAdmins } = useSuperAdmins();

  return (
    <div className="max-w-xl">
      <p className="mb-4 text-xs text-ink-faint">Super Admins have cross-org access to every organization on the platform — grant this sparingly.</p>
      <section className="rounded-xl border border-line bg-surface">
        <div className="border-b border-line-soft px-4 py-3.5">
          <span className="font-head text-[14.5px] text-ink">Current Super Admins ({superAdmins?.length ?? 0})</span>
        </div>
        <div className="flex flex-col gap-1 p-3">
          {superAdmins?.map((admin) => (
            <div key={admin.id} className="flex items-center gap-3 p-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber font-head text-[11px] text-white">
                {admin.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">{admin.name}</div>
                <div className="text-xs text-ink-faint">{admin.email}</div>
              </div>
            </div>
          ))}
          {superAdmins?.length === 0 && <p className="p-2.5 text-sm text-ink-faint">No super admins found.</p>}
        </div>
      </section>
      <p className="mt-3 text-xs text-ink-faint">
        New Super Admins are created via the backend seed script (<code className="rounded bg-line-soft px-1 py-0.5">scripts/seed_super_admin.py</code>), not through this UI.
      </p>
    </div>
  );
}

export default function PlatformSettingsPage() {
  const [tab, setTab] = useState<TabId>("email");

  return (
    <div className="p-8">
      <h1 className="mb-6 font-head text-xl text-ink">Platform Settings</h1>

      <div className="mb-6 flex w-[560px] max-w-full flex-wrap gap-1 rounded-xl bg-line-soft p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex min-w-[130px] flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[12.5px] ${
              tab === t.id ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-faint"
            }`}
          >
            <t.icon className={`h-3.5 w-3.5 ${tab === t.id ? "text-primary" : "text-ink-faint"}`} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "email" && <EmailNotificationsTab />}
      {tab === "registration" && <RegistrationTab />}
      {tab === "ai" && <AiConfigurationTab />}
      {tab === "superadmins" && <SuperAdminsTab />}
    </div>
  );
}
