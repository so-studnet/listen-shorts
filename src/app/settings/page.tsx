import type { Metadata } from "next";
import { AccountSection } from "@/components/account-section";
import { PackManager } from "@/components/pack-manager";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = { title: "設定 - ListenShorts" };

export default function Page() {
  return (
    <PageShell title="設定">
      <AccountSection />
      <PackManager />
    </PageShell>
  );
}
