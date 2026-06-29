export const LEGACY_LOCAL_USER_IDS = new Set([
  "local-dev-user",
  "00000000-0000-4000-8000-000000000001",
]);

export const LOCAL_USER_ID =
  process.env.LOCAL_USER_ID || "00000000-0000-4000-8000-000000000001";

export function isLocalDbMode() {
  return process.env.LOCAL_DB_MODE === "true";
}
