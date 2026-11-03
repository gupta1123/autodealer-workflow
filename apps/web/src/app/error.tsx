"use client";

import { AppErrorScreen } from "@/components/errors/AppErrorScreen";

export default function PageError({ error }: { error: Error & { digest?: string } }) {
  return <AppErrorScreen boundary="page" error={error} />;
}
