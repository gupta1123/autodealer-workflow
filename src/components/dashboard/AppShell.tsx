import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-zinc-50 p-4 sm:p-6">
      <div className="mx-auto grid max-w-[1700px] gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <DashboardSidebar />
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
