# Tally connection recovery and case company defaults

The Cases and Bank Statements connection pills use authenticated gateway presence in addition to the existing Tally company/heartbeat checks. A recent heartbeat alone cannot show a green connection while the selected connector is absent from the live gateway. Presence updates are scoped to the authenticated connection owner and selected PC, and the browser reconnects after gateway interruption.

Company, bank ledger, purchase catalogue, and supplier suggestion reads retry temporary live transport failures for up to about a minute. Permission errors, scans, debit-note writes, and purchase posting are never automatically replayed. Initial catalogue requests are cancelled on navigation, and successful loads remain cached across autosave/approval rechecks.

The connection menu says Pause connection. Pause uses the existing revocable, resumable pairing flow; Resume connection on the same PC requires Local Agent approval and preserves settings/history. It does not keep credentials usable while paused. Workflow-only users still cannot manage pairing.

Add Case selects an allowed remembered company, a sole allowed company, or the current Indian FY when all allowed records clearly belong to one business. An unambiguous active company on the preferred Tally connection can supply the default. Choices are validated against current purchases.prepare permissions, and remembered choices are scoped to organization and user. Unrelated or ambiguous companies require selection. A collapsed Change control keeps the chosen company visible before upload. Backend company authorization is unchanged.

This release requires frontend and gateway/backend deployment, without a migration or connector installer update.
