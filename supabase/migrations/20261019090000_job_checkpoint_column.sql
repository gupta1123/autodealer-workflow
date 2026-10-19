-- Analysis checkpoints (extracted documents saved so a retry can resume) used to live inside
-- packet_processing_jobs.result, so every progress update and status poll moved the whole blob.
-- A separate column keeps `result` small; the worker clears it when a job succeeds.
alter table public.packet_processing_jobs
  add column if not exists checkpoint jsonb;
