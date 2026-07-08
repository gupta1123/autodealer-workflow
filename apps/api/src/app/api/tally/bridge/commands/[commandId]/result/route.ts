import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { type DebitNoteProposalRow } from "@/lib/collections";
import { uploadDebitNotePdf } from "@/lib/debit-notes/pdf";
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

function getBridgeToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1] ?? request.headers.get("x-bridge-token") ?? "";
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

      return jsonWithCors(request, {
        command: serializeTallyBridgeCommand(completed.command),
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

    const now = new Date().toISOString();

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
      const possibleDuplicateInTally = Boolean((result as Record<string, unknown>).possibleDuplicateInTally);
      const nextStatus = success ? "posted" : possibleDuplicateInTally ? "needs_tally_review" : "failed";

      if (transactionId) {
        const { error: transactionUpdateError } = await supabase
          .from("bank_transactions")
          .update({
            tally_status: nextStatus,
            tally_posted_at: success ? now : null,
            tally_voucher_id: success ? voucherId : null,
          })
          .eq("id", transactionId)
          .eq("owner_user_id", connection.owner_user_id);

        if (transactionUpdateError) throw transactionUpdateError;
      }

      if (bankAccountId && fingerprint) {
        const { error: postingLogError } = await supabase
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
              status: nextStatus,
              tally_voucher_id: success ? voucherId : null,
              tally_posted_at: success ? now : null,
              error: errorMessage,
              result,
            },
            {
              onConflict: "owner_user_id,bank_account_id,fingerprint",
            }
          );

        if (postingLogError) throw postingLogError;
      }

    }

    if (command.command_type === "verify_bank_transaction") {
      const transactionId = toNullableText(commandPayload.transactionId, 80);
      const bankAccountId = toNullableText(commandPayload.bankAccountId, 80);
      const fingerprint = toNullableText(commandPayload.fingerprint, 500);
      const verificationStatus =
        toNullableText((result as Record<string, unknown>).verificationStatus, 80) ??
        (success ? "missing" : "failed");
      const matched =
        success &&
        (verificationStatus === "found" ||
          verificationStatus === "matched" ||
          verificationStatus === "verified");
      const ambiguous = success && verificationStatus === "ambiguous";
      const nextStatus = matched
        ? "verified"
        : ambiguous
          ? "needs_tally_review"
          : success
            ? "missing_in_tally"
            : "verification_failed";
      const voucherId =
        toNullableText((result as Record<string, unknown>).voucherId, 500) ??
        toNullableText((result as Record<string, unknown>).masterId, 500) ??
        toNullableText((result as Record<string, unknown>).voucherNumber, 500);

      if (transactionId) {
        const { error: transactionUpdateError } = await supabase
          .from("bank_transactions")
          .update({
            tally_status: nextStatus,
            tally_posted_at: matched ? now : null,
            tally_voucher_id: matched ? voucherId : null,
          })
          .eq("id", transactionId)
          .eq("owner_user_id", connection.owner_user_id);

        if (transactionUpdateError) throw transactionUpdateError;
      }

      if (bankAccountId && fingerprint) {
        const { error: postingLogError } = await supabase
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
              description: toNullableText(commandPayload.narration, 2000) ?? "Bank transaction verification",
              amount:
                typeof commandPayload.amount === "number"
                  ? commandPayload.amount
                  : Number(commandPayload.amount ?? 0) || null,
              voucher_type: "Payment",
              bank_ledger_name: toNullableText(commandPayload.bankLedgerName, 500),
              counterparty_ledger_name: toNullableText(commandPayload.counterpartyLedgerName, 500),
              command_id: commandId,
              status: nextStatus,
              tally_voucher_id: matched ? voucherId : null,
              tally_posted_at: matched ? now : null,
              error: errorMessage,
              result,
            },
            {
              onConflict: "owner_user_id,bank_account_id,fingerprint",
            }
          );

        if (postingLogError) throw postingLogError;
      }
    }

    if (command.command_type === "create_debit_note") {
      const proposalId = toNullableText(commandPayload.proposalId, 80);
      const voucherId =
        toNullableText((result as Record<string, unknown>).voucherId, 500) ??
        toNullableText((result as Record<string, unknown>).masterId, 500) ??
        commandId;
      const voucherGuid =
        toNullableText((result as Record<string, unknown>).voucherGuid, 500) ??
        toNullableText((result as Record<string, unknown>).guid, 500);
      const voucherNumber =
        toNullableText((result as Record<string, unknown>).voucherNumber, 500) ??
        toNullableText(commandPayload.referenceNumber, 500) ??
        voucherId;
      const openReferenceName =
        toNullableText((result as Record<string, unknown>).openReferenceName, 500) ??
        toNullableText(commandPayload.referenceNumber, 500) ??
        voucherNumber;
      const voucherDate = toNullableText(commandPayload.voucherDate, 20);
      const amount =
        typeof commandPayload.amount === "number"
          ? commandPayload.amount
          : Number(commandPayload.amount ?? 0) || null;

      if (proposalId) {
        const { data: updatedProposal, error: proposalUpdateError } = await supabase
          .from("debit_note_proposals")
          .update({
            status: success ? "created_in_tally" : "failed",
            tally_voucher_guid: success ? voucherGuid : null,
            tally_voucher_id: success ? voucherId : null,
            tally_voucher_number: success ? voucherNumber : null,
            tally_voucher_date: success ? voucherDate : null,
            tally_open_reference_name: success ? openReferenceName : null,
            remaining_recoverable_amount: success ? amount : null,
            created_in_tally_at: success ? now : null,
            last_synced_from_tally_at: success ? now : null,
            last_error: success ? null : errorMessage,
            updated_at: now,
          })
          .eq("id", proposalId)
          .eq("owner_user_id", connection.owner_user_id)
          .select("*")
          .maybeSingle();

        if (proposalUpdateError) throw proposalUpdateError;

        if (success && updatedProposal) {
          try {
            const pdfReference = await uploadDebitNotePdf(
              supabase as unknown as Parameters<typeof uploadDebitNotePdf>[0],
              updatedProposal as unknown as DebitNoteProposalRow
            );
            await supabase
              .from("debit_note_proposals")
              .update({
                tally_pdf_reference: pdfReference,
                updated_at: new Date().toISOString(),
              })
              .eq("id", proposalId)
              .eq("owner_user_id", connection.owner_user_id);
          } catch (pdfError) {
            console.error("Debit note PDF generation failed:", pdfError);
          }
        }
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
