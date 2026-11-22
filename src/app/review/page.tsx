import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { ReviewView } from "@/components/review-view";

export const metadata: Metadata = { title: "復習 - ListenShorts" };

export default function Page() {
  return (
    <PageShell title="復習">
      <ReviewView />
    </PageShell>
  );
}
