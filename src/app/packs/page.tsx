import type { Metadata } from "next";
import { PackManager } from "@/components/pack-manager";

export const metadata: Metadata = { title: "パック - ListenShorts" };

export default function Page() {
  return <PackManager />;
}
