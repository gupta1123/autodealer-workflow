import { notFound } from "next/navigation";

import { AppShell } from "@/components/dashboard/AppShell";
import { DevTallyConnectionPage } from "@/components/tally/DevTallyConnectionPage";

function isLocalDbMode() {
  return process.env.LOCAL_DB_MODE === "true" || process.env.NEXT_PUBLIC_LOCAL_DB_MODE === "true";
}

export default function TallyConnectionDevPage() {
  if (!isLocalDbMode()) {
    notFound();
  }

  return (
    <AppShell>
      <main className="min-h-screen bg-[#f7f4ee] px-4 py-6 text-[#1a1a1a] sm:px-8 sm:py-8">
        <div className="mx-auto max-w-5xl">
          <DevTallyConnectionPage />
        </div>
      </main>
    </AppShell>
  );
}
