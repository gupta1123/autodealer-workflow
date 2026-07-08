import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { serializeDebitNoteProposal, toNullableText, type DebitNoteProposalRow } from "@/lib/collections";
import { createDebitNotePdfSignedUrl } from "@/lib/debit-notes/pdf";
import { sendDebitNoteWhatsapp, getMsg91WhatsappConfig, normalizeWhatsappPhone } from "@/lib/msg91/whatsapp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function isMissingTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
  return /debit_note_proposals|relation .* does not exist|schema cache/i.test(message);
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = createSupabaseAdminClient();
  let ownerUserId = "";

  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }
    ownerUserId = user.id;

    const body = await request.json().catch(() => ({}));
    const config = getMsg91WhatsappConfig();
    if (!config.isConfigured) {
      return jsonWithCors(request, { error: "MSG91 WhatsApp is not configured." }, { status: 409 });
    }

    const { data: proposalData, error: proposalError } = await supabase
      .from("debit_note_proposals")
      .select("*")
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (proposalError) throw proposalError;
    if (!proposalData) {
      return jsonWithCors(request, { error: "Debit note proposal not found." }, { status: 404 });
    }

    const proposal = proposalData as unknown as DebitNoteProposalRow;
    if (proposal.status !== "created_in_tally") {
      return jsonWithCors(request, { error: "Create the debit note in Tally before sending WhatsApp." }, { status: 409 });
    }

    const recipientPhone = normalizeWhatsappPhone(body.recipientPhone ?? proposal.party_phone);
    if (!recipientPhone) {
      return jsonWithCors(request, { error: "Customer WhatsApp number is missing." }, { status: 400 });
    }

    const storedPdfUrl = await createDebitNotePdfSignedUrl(
      supabase as unknown as Parameters<typeof createDebitNotePdfSignedUrl>[0],
      proposal.tally_pdf_reference,
      60 * 60
    );
    const documentUrl = toNullableText(body.documentUrl, 2000) ?? storedPdfUrl ?? config.fallbackDocumentUrl;
    if (!documentUrl) {
      return jsonWithCors(
        request,
        { error: "Debit note PDF is missing. Recreate the debit note PDF before sending WhatsApp." },
        { status: 400 }
      );
    }

    const documentName =
      toNullableText(body.documentName, 180) ??
      (proposal.tally_voucher_number ? `${proposal.tally_voucher_number}.pdf` : undefined);
    const result = await sendDebitNoteWhatsapp({
      proposal,
      recipientPhone,
      documentUrl,
      documentName,
    });

    const now = new Date().toISOString();
    const { data: updatedData, error: updateError } = await supabase
      .from("debit_note_proposals")
      .update({
        communication_status: "sent",
        communication_channel: "whatsapp",
        communication_recipient: recipientPhone,
        communication_sent_at: now,
        customer_snapshot: {
          ...(proposal.customer_snapshot ?? {}),
          whatsapp: {
            provider: "msg91",
            senderNumber: config.senderNumber,
            templateName: config.templateName,
            templateMode: config.templateMode,
            sentAt: now,
            response: result.payload,
          },
        },
        last_error: null,
        updated_at: now,
      })
      .eq("id", proposal.id)
      .eq("owner_user_id", user.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return jsonWithCors(request, {
      proposal: serializeDebitNoteProposal(updatedData as unknown as DebitNoteProposalRow),
      sent: true,
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return jsonWithCors(
        request,
        { error: "Run the collections debit-note history migration before sending WhatsApp messages.", setupRequired: true },
        { status: 409 }
      );
    }

    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in POST /api/collections/debit-note-proposals/[id]/whatsapp:", error);

    if (id) {
      let query = supabase
        .from("debit_note_proposals")
        .update({
          communication_status: "failed",
          communication_channel: "whatsapp",
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (ownerUserId) {
        query = query.eq("owner_user_id", ownerUserId);
      }
      await query;
    }

    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}
