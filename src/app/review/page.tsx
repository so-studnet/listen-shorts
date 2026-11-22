import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = { title: "復習 - ListenShorts" };

export default function Page() {
  return (
    <PageShell title="復習">
      <p className="text-sm">
        間違えた問題を、間隔をあけて出し直す画面です。次のマイルストーン（M4）で作ります。
      </p>
    </PageShell>
  );
}
