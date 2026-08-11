# V7 migration fix

## Bank Statements: live Tally companies were missing

### Symptom

The Bank Statements page could show **Tally company verified** in the header while its company dropdown remained empty.

### Cause

During the V6-to-V7 code migration, the Bank Statements company request changed from a connector-scoped request to an unscoped request:

- Required: `GET /api/tally/companies?connectionId=<selected connector id>`
- Broken V7 request: `GET /api/tally/companies`

The API intentionally rejects an unscoped company request because company names must come from the selected live Tally connector. It returned HTTP 400 with `Select a Tally connector before loading companies.`

V7 also attempted to load connections and companies at the same time. On the first page load, the company request could therefore run before the selected connector was known.

### Fix applied

- Restored connector-scoped company fetching.
- Restored the preferred Tally connector selection used by V6.
- Changed initial page loading to load connectors first and then request companies for the selected connector.
- Changed Refresh to follow the same ordered flow.
- Passed the active connector explicitly when refreshing companies after a Tally master sync.
- Removed the stale in-memory company fallback so the dropdown reflects only companies returned for the current live connector.

### Data and migration impact

- No Supabase schema change is required.
- No SQL migration is required.
- No environment-variable change is required.
- No Tally master or company data was changed.

### Expected result

When the connector is online, the Bank Statements company dropdown lists the companies returned by the currently selected Tally connector. The frontend request to `/api/tally/companies` includes the connector ID and returns HTTP 200 instead of HTTP 400.

---

## Bank Statements: valid PDFs could be falsely labelled password protected

### Symptom

A normal, unprotected bank-statement PDF could be rejected with password-related wording. Damaged PDFs and server tooling failures could produce the same message.

### Cause

The earlier implementation attempted `pdfinfo` and then always called `python3`. It treated almost every unexpected failure as unsupported password protection.

This was unreliable on Windows because:

- `pdfinfo` may not be available as a directly executable program to the Node process.
- `python3` may be an unusable Microsoft Store alias even when `python` is installed.
- Missing Python dependencies, corrupt PDF structure and parser failures were all converted into a password-protected error.
- Any encrypted PDF immediately requested a password, even when the PDF could be opened with an empty password.

### Fix applied

- Added a shared PDF-security service in `apps/api/src/lib/pdf-security.ts`.
- Detects a valid PDF header before invoking the parser.
- Resolves an available Python interpreter by platform:
  - Windows: `py -3`, `python`, then `python3`.
  - Linux/macOS: `python3`, then `python`.
  - `KALIKA_PDF_PYTHON_BIN` may explicitly select the interpreter.
- Uses `pypdf`, with compatibility fallback to `PyPDF2`.
- Tries the supplied password, including an empty password, before asking the user for one.
- Rewrites successfully opened encrypted PDFs without encryption for downstream analysis.
- Passes the password through stdin and never stores or logs it.
- Preserves leading and trailing spaces in passwords.
- Always removes temporary PDF files.

### Explicit outcomes

The API now distinguishes:

- `BANK_STATEMENT_PASSWORD_REQUIRED`: the PDF genuinely requires a password.
- `BANK_STATEMENT_PASSWORD_INCORRECT`: the supplied password is wrong.
- `BANK_STATEMENT_PASSWORD_UNSUPPORTED`: the encryption type cannot be opened.
- `BANK_STATEMENT_PDF_INVALID`: the file is not a PDF or its PDF structure is damaged.
- `BANK_STATEMENT_PDF_SERVICE_UNAVAILABLE`: the server has no working PDF parser runtime.

Only the required-password and incorrect-password outcomes open the password field in the frontend. Invalid PDFs, unsupported encryption and server configuration errors display their own messages instead of a misleading password prompt.

### Runtime setup

Install the API PDF dependency using the interpreter that runs the API helper:

```powershell
python -m pip install -r apps/api/requirements-pdf.txt
```

If the server uses a non-default Python executable, set:

```text
KALIKA_PDF_PYTHON_BIN=<absolute path to the Python executable>
```

The configured Python runtime must contain `pypdf`. The requirement is recorded in `apps/api/requirements-pdf.txt`.

### Test coverage

Run:

```text
npm run test:pdf-security
```

The regression tests cover:

- Valid unencrypted PDF.
- PDF that genuinely requires a password.
- Incorrect password.
- Correct password and decrypted output.
- Encrypted PDF that opens with an empty password.
- Damaged PDF reported as invalid rather than password protected.
- Non-PDF file renamed with a `.pdf` extension.

### Data and migration impact

- No Supabase schema change is required.
- No SQL migration is required.
- Uploaded passwords are not persisted.
- Existing stored bank statements are unchanged.
