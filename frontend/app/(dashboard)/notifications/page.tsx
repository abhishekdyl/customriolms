"use client";

import { useState } from "react";
import { BellRing, MessageSquare, Server } from "lucide-react";
import type { ComponentType } from "react";
import { Topbar } from "@/components/shell/topbar";
import { SmtpTab } from "@/components/shell/notifications/smtp-tab";
import { TemplatesTab } from "@/components/shell/notifications/templates-tab";
import { RulesTab } from "@/components/shell/notifications/rules-tab";

type TabId = "smtp" | "templates" | "rules";
const tabs: [TabId, string, ComponentType<{ size?: number; className?: string }>][] = [
  ["smtp", "Email delivery", Server],
  ["templates", "Templates", MessageSquare],
  ["rules", "Reminder rules", BellRing],
];

export default function NotificationsPage() {
  const [tab, setTab] = useState<TabId>("smtp");
  return (
    <div className="flex flex-col h-screen min-w-0 flex-1">
      <Topbar title="Notifications" />
      <div className="p-5 md:p-8 overflow-auto flex-1">
        <div className="flex flex-col md:flex-row gap-1.5 md:gap-0 p-1 mb-6 bg-line-soft rounded-[10px] w-full md:w-[460px]">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id} type="button" onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg ${tab === id ? "bg-surface" : ""}`}
            >
              <Icon size={13} className={tab === id ? "text-primary" : "text-ink-faint"} />
              <span className={`text-[12.5px] ${tab === id ? "text-ink font-semibold" : "text-ink-faint"}`}>{label}</span>
            </button>
          ))}
        </div>
        {tab === "smtp" && <SmtpTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "rules" && <RulesTab />}
      </div>
    </div>
  );
}
