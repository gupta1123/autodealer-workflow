import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { isLocalDbMode } from "@/lib/local/mode";
import { completeLocalTallyCommand } from "@/lib/local/tally-store";
import { hashSecret, type TallyConnectionRow } from "@/lib/tally/connections";
import {
  serializeTallyBridgeCommand,
  type TallyBridgeCommandRow,
} from "@/lib/tally/commands";
import { toNullableText } from "@/lib/tally/masters";
import { normalizeMasterKey } from "@/lib/tally/masters";

const CONNECTION_SELECT = [
  "id",
  "owner_user_id",
  "display_name",
  "status",
  "tally_url",
  "pairing_code_hash",
  "pairing_code_expires_at",
  "paired_at",
  "bridge_name",
  "bridge_version",
  "bridge_machine_id",
  "last_heartbeat_at",
  "last_tested_at",
  "last_tally_reachable",
  "last_company_loaded",
  "last_company_name",
  "last_error",
  "created_at",
  "updated_at",
].join(", ");

type PostedBankTransactionRow = {
  transaction_date: string;
  value_date: string | null;
  description: string;
  reference_number: string | null;
  debit_amount: number | string | null;
  credit_amount: number | string | null;
  balance_amount: number | string | null;
  transaction_type: string | null;
  category: string | null;
  counterparty_name: string | null;
  fingerprint: string | null;
};

function getBridgeToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1] ?? request.headers.get("x-bridge-token") ?? "";
}

function normalizeCheckpointAmount(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function buildPostedTransactionCheckpointMarker(row: PostedBankTransactionRow) {
  return {
    transactionDate: row.transaction_date,
    valueDate: row.value_date,
    description: row.description,
    referenceNumber: row.reference_number,
    debitAmount: normalizeCheckpointAmount(row.debit_amount),
    creditAmount: normalizeCheckpointAmount(row.credit_amount),
    balanceAmount: normalizeCheckpointAmount(row.balance_amount),
    transactionType: row.transaction_type ?? "unknown",
    category: row.category ?? "unknown",
    counterpartyName: row.counterparty_name,
    fingerprint: row.fingerprint ?? "",
  };
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ commandId: string }> }
) {
  try {
    const token = getBridgeToken(request);
    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";

    if (!connectionId || !token) {
      return jsonWithCors(request, { error: "Connection id and bridge token are required." }, { status: 400 });
    }

    const { commandId } = await context.params;
    const success = body.status === "succeeded" || body.success === true;
    const result = body.result && typeof body.result === "object" ? body.result : {};
    const errorMessage = success ? null : toNullableText(body.error, 2000) ?? "Tally command failed.";
    const now = new Date().toISOString();

    if (isLocalDbMode()) {
      const completed = await completeLocalTallyCommand({
        connectionId,
        token,
        commandId,
        success,
        result,
        error: errorMessage,
      });

      if (completed.unauthorized) {
        return jsonWithCors(request, { error: "Invalid bridge token." }, { status: 401 });
      }

      if (!completed.command) {
        return jsonWithCors(request, { error: "Tally command not found." }, { status: 404 });
      }

      const command = completed.command as TallyBridgeCommandRow;
      const commandPayload =
        command.payload && typeof command.payload === "object"
          ? (command.payload as Record<string, unknown>)
          : {};

      if (command.command_type === "post_bank_voucher") {
        const supabase = createSupabaseAdminClient();
        const transactionId = toNullableText(commandPayload.transactionId, 80);
        const bankAccountId = toNullableText(commandPayload.bankAccountId, 80);
        const fingerprint = toNullableText(commandPayload.fingerprint, 500);
        const voucherId =
          toNullableText((result as Record<string, unknown>).voucherId, 500) ??
          toNullableText((result as Record<string, unknown>).masterId, 500) ??
          commandId;

        if (transactionId) {
          await supabase
            .from("bank_transactions")
            .update({
              tally_status: success ? "posted" : "failed",
              tally_posted_at: success ? now : null,
              tally_voucher_id: success ? voucherId : null,
            })
            .eq("id", transactionId)
            .eq("owner_user_id", command.owner_user_id);
        }

        if (bankAccountId && fingerprint) {
          await supabase
            .from("bank_transaction_posting_log")
            .upsert(
              {
                owner_user_id: command.owner_user_id,
                bank_account_id: bankAccountId,
                connection_id: null,
                source_transaction_id: transactionId,
                fingerprint,
                transaction_date: toNullableText(commandPayload.voucherDate, 20) ?? now.slice(0, 10),
                reference_number: toNullableText(commandPayload.referenceNumber, 500),
                description: toNullableText(commandPayload.narration, 2000) ?? "Bank transaction",
                amount:
                  typeof commandPayload.amount === "number"
                    ? commandPayload.amount
                    : Number(commandPayload.amount ?? 0) || null,
                voucher_type: toNullableText(commandPayload.voucherType, 80),
                bank_ledger_name: toNullableText(commandPayload.bankLedgerName, 500),
                counterparty_ledger_name: toNullableText(commandPayload.counterpartyLedgerName, 500),
                command_id: null,
                status: success ? "posted" : "failed",
                tally_voucher_id: success ? voucherId : null,
                tally_posted_at: success ? now : null,
                error: errorMessage,
                result,
              },
              {
                onConflict: "owner_user_id,bank_account_id,fingerprint",
              }
            );
        }

        if (success && bankAccountId) {
          const { data: latestPostedRows, error: latestPostedError } = await supabase
            .from("bank_transactions")
            .select(
              [
                "transaction_date",
                "value_date",
                "description",
                "reference_number",
                "debit_amount",
                "credit_amount",
                "balance_amount",
                "transaction_type",
                "category",
                "counterparty_name",
                "fingerprint",
              ].join(", ")
            )
            .eq("owner_user_id", command.owner_user_id)
            .eq("bank_account_id", bankAccountId)
            .eq("tally_status", "posted")
            .order("transaction_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1);

          if (latestPostedError) throw latestPostedError;

          const latestPosted = (latestPostedRows?.[0] ?? null) as unknown as PostedBankTransactionRow | null;
          const checkpointDate = latestPosted?.transaction_date ?? toNullableText(commandPayload.voucherDate, 20);
          await supabase
            .from("bank_accounts")
            .update({
              last_imported_transaction_at: checkpointDate ? `${checkpointDate}T00:00:00.000Z` : now,
              last_imported_transaction_marker: latestPosted
                ? buildPostedTransactionCheckpointMarker(latestPosted)
                : {},
              last_tally_posted_transaction_at: checkpointDate ? `${checkpointDate}T00:00:00.000Z` : now,
            })
            .eq("id", bankAccountId)
            .eq("owner_user_id", command.owner_user_id);
        }
      }

      return jsonWithCors(request, {
        command: serializeTallyBridgeCommand(command),
      });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("tally_connections")
      .select(`${CONNECTION_SELECT}, bridge_token_hash`)
      .eq("id", connectionId)
      .maybeSingle();

    if (error) throw error;

    const connection = data as unknown as (TallyConnectionRow & { bridge_token_hash: string | null }) | null;
    if (!connection?.bridge_token_hash || hashSecret(token) !== connection.bridge_token_hash) {
      return jsonWithCors(request, { error: "Invalid bridge token." }, { status: 401 });
    }

    const { data: commandData, error: updateError } = await supabase
      .from("tally_bridge_commands")
      .update({
        status: success ? "succeeded" : "failed",
        result,
        error: errorMessage,
        completed_at: now,
      })
      .eq("id", commandId)
      .eq("connection_id", connection.id)
      .in("status", ["claimed", "queued"])
      .select("*")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!commandData) {
      return jsonWithCors(request, { error: "Tally command not found." }, { status: 404 });
    }

    const command = commandData as unknown as TallyBridgeCommandRow;
    const commandPayload =
      command.payload && typeof command.payload === "object"
        ? (command.payload as Record<string, unknown>)
        : {};

    if (success && command.command_type === "alter_ledger") {
      const masterKey = toNullableText(commandPayload.masterKey, 500);
      const newName = toNullableText(commandPayload.newName, 500);

      if (masterKey && newName) {
        await supabase
          .from("tally_masters")
          .update({
            tally_name: newName,
            raw_payload: {
              ...commandPayload,
              updatedFromCommandId: commandId,
              updatedFromCommandAt: now,
            },
          })
          .eq("connection_id", connection.id)
          .eq("owner_user_id", connection.owner_user_id)
          .eq("master_key", masterKey);
      }
    }

    if (success && command.command_type === "create_ledger") {
      const name = toNullableText(commandPayload.name, 500);
      const parentName = toNullableText(commandPayload.parentName, 240);

      if (name && parentName) {
        await supabase.from("tally_masters").upsert(
          {
            connection_id: connection.id,
            owner_user_id: connection.owner_user_id,
            sync_run_id: null,
            master_type: "ledger",
            master_key: normalizeMasterKey({ masterType: "ledger", name }),
            tally_guid: null,
            tally_name: name,
            parent_name: parentName,
            raw_payload: {
              createdFromCommandId: commandId,
              createdFromCommandAt: now,
              result,
            },
            is_active: true,
            last_synced_at: now,
          },
          {
            onConflict: "connection_id,master_type,master_key",
          }
        );
      }
    }

    if (command.command_type === "post_bank_voucher") {
      const transactionId = toNullableText(commandPayload.transactionId, 80);
      const bankAccountId = toNullableText(commandPayload.bankAccountId, 80);
      const fingerprint = toNullableText(commandPayload.fingerprint, 500);
      const voucherId =
        toNullableText((result as Record<string, unknown>).voucherId, 500) ??
        toNullableText((result as Record<string, unknown>).masterId, 500) ??
        commandId;

      if (transactionId) {
        await supabase
          .from("bank_transactions")
          .update({
            tally_status: success ? "posted" : "failed",
            tally_posted_at: success ? now : null,
            tally_voucher_id: success ? voucherId : null,
          })
          .eq("id", transactionId)
          .eq("owner_user_id", connection.owner_user_id);
      }

      if (bankAccountId && fingerprint) {
        await supabase
          .from("bank_transaction_posting_log")
          .upsert(
            {
              owner_user_id: connection.owner_user_id,
              bank_account_id: bankAccountId,
              connection_id: connection.id,
              source_transaction_id: transactionId,
              fingerprint,
              transaction_date: toNullableText(commandPayload.voucherDate, 20) ?? now.slice(0, 10),
              reference_number: toNullableText(commandPayload.referenceNumber, 500),
              description: toNullableText(commandPayload.narration, 2000) ?? "Bank transaction",
              amount:
                typeof commandPayload.amount === "number"
                  ? commandPayload.amount
                  : Number(commandPayload.amount ?? 0) || null,
              voucher_type: toNullableText(commandPayload.voucherType, 80),
              bank_ledger_name: toNullableText(commandPayload.bankLedgerName, 500),
              counterparty_ledger_name: toNullableText(commandPayload.counterpartyLedgerName, 500),
              command_id: commandId,
              status: success ? "posted" : "failed",
              tally_voucher_id: success ? voucherId : null,
              tally_posted_at: success ? now : null,
              error: errorMessage,
              result,
            },
            {
              onConflict: "owner_user_id,bank_account_id,fingerprint",
            }
          );
      }

      if (success && bankAccountId) {
        const { data: latestPostedRows, error: latestPostedError } = await supabase
          .from("bank_transactions")
          .select(
            [
              "transaction_date",
              "value_date",
              "description",
              "reference_number",
              "debit_amount",
              "credit_amount",
              "balance_amount",
              "transaction_type",
              "category",
              "counterparty_name",
              "fingerprint",
            ].join(", ")
          )
          .eq("owner_user_id", connection.owner_user_id)
          .eq("bank_account_id", bankAccountId)
          .eq("tally_status", "posted")
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        if (latestPostedError) throw latestPostedError;

        const latestPosted = (latestPostedRows?.[0] ?? null) as unknown as PostedBankTransactionRow | null;
        const checkpointDate = latestPosted?.transaction_date ?? toNullableText(commandPayload.voucherDate, 20);
        await supabase
          .from("bank_accounts")
          .update({
            last_imported_transaction_at: checkpointDate ? `${checkpointDate}T00:00:00.000Z` : now,
            last_imported_transaction_marker: latestPosted
              ? buildPostedTransactionCheckpointMarker(latestPosted)
              : {},
            last_tally_posted_transaction_at: checkpointDate ? `${checkpointDate}T00:00:00.000Z` : now,
          })
          .eq("id", bankAccountId)
          .eq("owner_user_id", connection.owner_user_id);
      }
    }

    await supabase.from("tally_connection_events").insert({
      connection_id: connection.id,
      owner_user_id: connection.owner_user_id,
      event_type: success ? "command_succeeded" : "command_failed",
      message: success ? "Tally command completed." : "Tally command failed.",
      payload: {
        commandId,
        commandType: command.command_type,
        error: errorMessage,
      },
    });

    return jsonWithCors(request, {
      command: serializeTallyBridgeCommand(command),
    });
  } catch (error) {
    console.error("Error in POST /api/tally/bridge/commands/[commandId]/result:", error);
    return jsonWithCors(
      request,
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
