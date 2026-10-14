/** Runs without a dashboard tab. Connector reads stay sequential and bounded. */
export function startFollowupAutomation({ contexts, scan, reconcile, read, deliver, report = console.warn, intervalMs = 60_000 }) {
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      for (const context of await contexts()) {
        if (stopped) break;
        try {
          const snapshot = await scan(context);
          const tasks = await reconcile(context, snapshot);
          for (const task of tasks) {
            if (stopped) break;
            // Re-read the specific invoice immediately before provider submission.
            try {
              const evidence = await read(context, task);
              await deliver(context, task, evidence);
            } catch (error) { report(`Automatic invoice reminder deferred: ${error.message}`); }
          }
        } catch (error) {
          // An offline connector or an incomplete scan never authorizes sending.
          report(`Automatic payment follow-ups deferred: ${error instanceof Error ? error.message : 'verification unavailable'}`);
        }
      }
    } catch (error) { report(`Automatic payment follow-ups unavailable: ${error.message}`); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref?.();
  return { tick, stop: () => { stopped = true; clearInterval(timer); } };
}
