import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnv() {
  const env = {};
  const text = fs.readFileSync(".env", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[line.slice(0, index).trim()] = value;
  }
  return env;
}

const apply = process.argv.includes("--apply");
const env = readEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: rules, error } = await supabase
  .from("cash_discount_rules")
  .select("*")
  .order("created_at", { ascending: true });

if (error) throw new Error(error.message);

const activeRules = rules ?? [];
const preferred =
  activeRules.find((rule) => String(rule.rule_name ?? "").trim() === "Standard 2% within 15 days") ??
  activeRules.find((rule) => String(rule.rule_name ?? "").toLowerCase().includes("standard")) ??
  activeRules.find((rule) => String(rule.rule_name ?? "").trim() === "2% CD within 15 days") ??
  activeRules[0];

const deleteIds = activeRules
  .filter((rule) => preferred && rule.id !== preferred.id)
  .map((rule) => rule.id);

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      existing: activeRules.map((rule) => ({
        id: rule.id,
        rule_name: rule.rule_name,
        discount_value: rule.discount_value,
        eligibility_days: rule.eligibility_days,
        missed_cd_treatment: rule.missed_cd_treatment,
        is_active: rule.is_active,
        created_at: rule.created_at,
      })),
      keep: preferred
        ? {
            id: preferred.id,
            rule_name: preferred.rule_name,
          }
        : null,
      deleteIds,
    },
    null,
    2
  )
);

if (apply && deleteIds.length) {
  const { error: deleteError } = await supabase.from("cash_discount_rules").delete().in("id", deleteIds);
  if (deleteError) throw new Error(deleteError.message);
}

if (apply) {
  const { data: remaining, error: remainingError } = await supabase
    .from("cash_discount_rules")
    .select("id, rule_name, discount_value, eligibility_days, missed_cd_treatment, is_active, created_at")
    .order("created_at", { ascending: true });
  if (remainingError) throw new Error(remainingError.message);
  console.log(JSON.stringify({ remaining }, null, 2));
}
