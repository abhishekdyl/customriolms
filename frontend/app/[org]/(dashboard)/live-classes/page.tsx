"use client";

import { Topbar } from "@/components/shell/topbar";
import { LiveClassesTab } from "@/components/shell/live-classes/live-classes-tab";

export default function LiveClassesPage() {
  return (
    <div className="flex flex-col h-screen min-w-0 flex-1">
      <Topbar title="Live Classes" />
      <div className="p-5 md:p-8 overflow-auto flex-1">
        <LiveClassesTab />
      </div>
    </div>
  );
}
