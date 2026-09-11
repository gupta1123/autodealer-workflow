# Invoice follow-up pipelines

## Updated defaults and one-time flow

Also manually apply `20260907083147_followup_defaults_and_one_time.sql` in Kalika. It has been validated only in a disposable local database. Settings → Payment reminders now stores the organization-wide stage templates, intervals, limits and default Send once template. Existing schedules retain their copied stages.

Invoice setup asks only for a missing phone number, optionally queues its save to Tally, and offers Start reminders or Send once. Both verify outstanding first. Send once goes straight to provider submission without a preview or template selector; its durable record is marked `mode=once`, never a recurring schedule, and is excluded from Reminders due. Its history remains available in Reminder tracking. Never retry an uncertain submission blindly.

Phone saves say **queued**, not **saved**. Tally execution may fail after queuing; inspect the connector command result before assuming the ledger was updated. Minute, hour and day schedules accept any valid Indian WhatsApp number. No installer change is needed for the existing `alter_ledger` command.

## Manual rollout

Apply only `supabase/migrations/20260907073704_invoice_followup_pipelines.sql` to **Kalika**, after its existing Team & Access migrations. Do not run `scripts/test-followup-migration.sql` on a hosted project: it is a disposable test fixture. No hosted migration has been applied by this implementation.

Backend configuration:

- `CASH_DISCOUNT_GATEWAY_URL`: the existing authenticated gateway WebSocket URL (local default `ws://127.0.0.1:3002/cash-discount-live`).
- Existing `MSG91_AUTHKEY` and `MSG91_WHATSAPP_NUMBER`.
- `FOLLOWUP_WHATSAPP_TEMPLATES_JSON`: optional additional approved provider templates. Kalika includes the approved `payment_reminder_v2` template by default (English, namespace `2bf6cec8_61b1_4925_8632_49e9ddebff44`, five positional text variables), so this variable is not required for the standard reminder flow. Values with the same key override the built-in metadata after review. This configuration does not create or approve a WhatsApp template.

```json
[{"key":"gentle","name":"YOUR_APPROVED_NAME","namespace":"YOUR_NAMESPACE","language":"en","text":"Dear {{customer}}, invoice {{invoice}} has {{outstanding}} outstanding with {{company}}.","components":{"body_1":"customer","body_2":"invoice","body_3":"outstanding","body_4":"company"}}]
```

Restart the backend after environment changes. No connector rebuild is required: this uses its existing authenticated open-bill operation.

## Client flow

Payment Follow-ups → Set reminders on an invoice → Send once or configure stages → Start pipeline. Administrators can save reusable schedules. Each invoice has its own counters, amount and recipient.

Open Follow-up pipelines → Due now → Check outstanding → Review & send → Send WhatsApp. Schedules do **not** automatically send messages. Tally and its paired connector must be available for the check; the verified result expires after five minutes. A payment entered after the check remains a possible race: recheck when in doubt.

Partial payments update the amount. No matching bill or ambiguous evidence blocks reminders for review, because disappearance alone does not prove payment. Paused invoices do not send. Resume makes the next reminder due and requires another check. The final stage stops at its configured submission limit. Failed submissions do not advance the stage; delayed schedules do not send accumulated catch-up messages.

The provider's acceptance means **submitted**, not delivered. An uncertain response or crash during submission is held; do not blindly retry. An operator must inspect the provider history before a supervised resolution. Automatic provider reconciliation and automated sending are not included.

## Verification performed

- Frontend and API TypeScript checks.
- Stage validation, minute intervals, partial/zero balance, ambiguous evidence, stage advancement and stopping tests.
- Authenticated WebSocket handoff fixture, without Tally or real messages.
- Migration applied only to disposable local PostgreSQL; duplicate claim, wrong pairing, unauthorized claim, idempotent finish, RLS and grants checked.

Before client rollout: apply the migration and test one invoice and a test recipient through the real connector/provider. The standard template is selected automatically; an administrator only needs to save settings if they want to persist a custom schedule. No live WhatsApp message was sent during implementation. Tally performance and provider delivery are not established by fixture tests.
