import { notFound } from "next/navigation";

import { AppShell } from "@/components/dashboard/AppShell";
import { DevTallyConnectionPage } from "@/components/tally/DevTallyConnectionPage";

export const dynamic = "force-dynamic";

function configuredAccessKey() {
  return (
    process.env.TALLY_CONNECTOR_PAGE_KEY ||
    process.env.CONNECTOR_PAGE_KEY ||
    process.env.NEXT_PUBLIC_TALLY_CONNECTOR_PAGE_KEY ||
    ""
  ).trim();
}

export default async function ManualTallyConnectionPage({
  params,
}: {
  params: Promise<{ accessKey: string }>;
}) {
  const expectedKey = configuredAccessKey();
  const { accessKey } = await params;

  if (!expectedKey || accessKey !== expectedKey) {
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
