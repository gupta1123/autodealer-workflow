"use client";

import { useEffect } from "react";
import { reportClientError, type CrashBoundary } from "@/lib/report-client-error";

export function AppErrorScreen({ error, boundary }: { error: Error & { digest?: string }; boundary: CrashBoundary }) {
  useEffect(() => {
    reportClientError(error, boundary);
  }, [error, boundary]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6" role="alert">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-[#1a1a1a]">This page stopped working</h1>
        <p className="mt-2 text-sm leading-6 text-[#6f6255]">
          Reload the page to continue. Anything you had not saved on this page may need to be entered again. If it happens again, tell your administrator which page you were on.
        </p>
        <button
          className="mt-5 rounded-xl bg-[#2d2d2d] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1a1a1a] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          onClick={() => window.location.reload()}
          type="button"
        >
          Reload page
        </button>
      </div>
    </main>
  );
}
