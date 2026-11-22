/** タブの中の、縦にスクロールするページの枠。 */
export function PageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
        <h1 className="text-lg font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
