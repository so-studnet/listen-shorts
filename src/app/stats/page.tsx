import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { StatsView } from "@/components/stats-view";

export const metadata: Metadata = { title: "記録 - ListenShorts" };

export default function Page() {
  return (
    <PageShell title="記録">
      <StatsView />
    </PageShell>
  );
}
