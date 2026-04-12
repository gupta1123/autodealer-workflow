import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "#f7f7f5",
      }}
    >
      {/* Fixed-width sidebar */}
      <DashboardSidebar />

      {/* Scrollable main content area */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          backgroundColor: "#f7f7f5",
        }}
      >
        {children}
      </main>
    </div>
  );
}
