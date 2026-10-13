"use client";
import { useState } from "react";
import { Server, ShieldQuestion, Wand2, UserCog, Send, Loader2, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { usePlatformSettings, useUpdatePlatformSettings, useSuperAdmins, useOrgs } from "@/lib/hooks/use-orgs";

type TabId = "email" | "registration" | "ai" | "superadmins";

const tabs: { id: TabId; label: string; icon: typeof Server }[] = [
  { id: "email", label: "Email & Notifications", icon: Server },
  { id: "registration", label: "Registration", icon: ShieldQuestion },
  { id: "ai", label: "AI Configuration", icon: Wand2 },
  { id: "superadmins", label: "Super Admins", icon: UserCog },
];

// ---------------------------------------------------------------------------
// Email & Notifications — LAYOUT ONLY. There's no PlatformSmtpSettings model
// or endpoint on the backend yet, so this tab is local component state: it
// looks and behaves like the real thing (typing, Save, Send test email all
// respond) but nothing here is persisted or actually sends mail. Wiring this
// up for real needs a settings table + an endpoint + an actual mail-send
// service, which is a separate piece of work from the layout itself.
// ---------------------------------------------------------------------------
function EmailNotificationsTab() {
  const { data: orgs } = useOrgs();
  const [smtp, setSmtp] = useState({
    host: "smtp.riosmartlms.com",
    port: "587",
    encryption: "TLS",
    username: "platform-mailer",
    password: "",
    fromName: "Riosmart LMS",
    fromEmail: "no-reply@riosmartlms.com",
  });
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | null>(null);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const sendTest = () => {
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTesting(false);
      setTestResult("success");
    }, 900);
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-5 flex items-start gap-3 rounded-lg border-l-[3px] border-primary bg-primary-soft px-4 py-3.5">
        <Server className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <p className="text-[13px] text-ink">
          This is the shared mail server every org sends from by default. An Org Admin can override it with their own SMTP
          under their org&apos;s Notifications settings — this platform default is only the fallback for orgs that haven&apos;t.
        </p>
      </div>

      <section className="mb-6 rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3.5 font-head text-sm text-ink">Riosmart shared SMTP</h2>
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label className="mb-1.5 block">SMTP host</Label>
            <Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Port</Label>
            <Input value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Encryption</Label>
            <select
              value={smtp.encryption}
              onChange={(e) => setSmtp({ ...smtp, encryption: e.target.value })}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus-visible:border-primary"
            >
              {["TLS", "SSL", "None"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block">Username</Label>
            <Input value={smtp.username} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Password</Label>
            <Input type="password" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} placeholder="••••••••••" />
          </div>
          <div>
            <Label className="mb-1.5 block">Default &quot;From&quot; name</Label>
            <Input value={smtp.fromName} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Default &quot;From&quot; email</Label>
            <Input value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} />
          </div>
        </div>

        {testResult === "success" && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            <span className="text-[12.5px] text-ink">Test email sent successfully.</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={save}>Save settings</Button>
          <Button variant="secondary" onClick={sendTest} disabled={testing}>
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {testing ? "Sending…" : "Send test email"}
          </Button>
          {saved && <span className="text-xs text-success">Saved</span>}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface">
        <div className="border-b border-line-soft px-4 py-3.5">
          <span className="font-head text-[14.5px] text-ink">Which orgs use their own SMTP</span>
        </div>
        <div className="flex flex-col gap-1 p-3">
          {orgs?.map((org) => (
            <div key={org.id} className="flex items-center gap-3 px-2 py-2">
              <Building2 className="h-3.5 w-3.5 text-ink-faint" />
              <span className="flex-1 text-sm text-ink">{org.name}</span>
              {/* No org-level custom-SMTP flag exists on the backend yet — every
                  org shows as Platform default until that field is added. */}
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-[10.5px] font-semibold text-ink-faint">Platform default</span>
            </div>
          ))}
          {!orgs?.length && <p className="px-2 py-2 text-sm text-ink-faint">No organizations yet.</p>}
        </div>
      </section>
    </div>
  );
}

function RegistrationTab() {
  const { data: settings, isLoading } = usePlatformSettings();
  const updateSettings = useUpdatePlatformSettings();

  return (
    <div className="max-w-2xl">
      <section className="mb-5 rounded-xl border border-line bg-surface p-5">
        {isLoading ? (
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
              checked={settings?.allow_self_serve_signup ?? true}
              onCheckedChange={(checked) => updateSettings.mutate({ allow_self_serve_signup: checked })}
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
