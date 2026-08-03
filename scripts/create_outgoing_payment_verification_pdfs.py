from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "outgoing-payment-verification-v1"


def row(date: str, narration: str, reference: str, amount: float, expected: str, reason: str):
    return {
        "date": date,
        "narration": narration,
        "reference": reference,
        "withdrawal": amount,
        "expected": expected,
        "reason": reason,
    }


PACK = [
    {
        "file": "01_Nyx_Kotak_Core-Found-and-Missing.pdf",
        "company": "Nyx",
        "bank": "Kotak Mahindra Bank",
        "account": "6713098600",
        "opening": 900000,
        "rows": [
            row("2026-07-03", "NEFT DR TO PRAKASH BEARINGS HOUSE", "HDF260703704", 42000, "already_in_tally", "Exact existing Kotak Payment voucher."),
            row("2026-07-03", "IMPS DR TO METRO STEEL DEPOT", "SBI260703705", 31000, "missing_in_tally", "No seeded Payment voucher."),
            row("2026-07-03", "BANK SMS ALERT CHARGES", "CHG260703706", 59, "already_in_tally", "Exact existing Kotak bank-charge voucher."),
            row("2026-07-03", "ATM CASH WITHDRAWAL", "ATM260703001", 10000, "missing_in_tally", "No seeded ATM Payment voucher."),
            row("2026-07-07", "NEFT DR TO NOBLE INDUSTRIAL SUPPLY", "YES260707701", 75000, "already_in_tally", "Exact existing Kotak Payment voucher."),
            row("2026-07-07", "RTGS DR TO WESTERN MILL STORES", "IC260707702", 64000, "missing_in_tally", "No seeded Payment voucher."),
            row("2026-07-07", "BANK GUARANTEE COMMISSION", "CHG260707707", 1180, "missing_in_tally", "No seeded bank-charge voucher."),
            row("2026-07-07", "NEFT DR OFFICE RENT", "RENT260707", 36000, "missing_in_tally", "No seeded rent Payment voucher."),
        ],
    },
    {
        "file": "02_Nyx_Kotak-Duplicates-and-Ambiguity.pdf",
        "company": "Nyx",
        "bank": "Kotak Mahindra Bank",
        "account": "6713098600",
        "opening": 400000,
        "rows": [
            row("2026-07-09", "BANK CHARGES JULY STATEMENT", "CHG260709703", 236, "already_in_tally_duplicate", "The live fixture contains duplicate vouchers with this strict reference."),
            row("2026-07-09", "NEFT DR SUPPLIER PAYMENT WITHOUT BANK REFERENCE", "", 50000, "ambiguous", "Multiple same-date, same-amount Kotak payments exist and no reliable reference selects one."),
            row("2026-07-09", "NEFT DR SUPPLIER PAYMENT", "JUL090000", 50000, "missing_in_tally", "Amount/date candidates exist, but the exact statement reference does not match."),
            row("2026-07-09", "BANK SERVICE FEE JULY", "CHG260709704", 590, "missing_in_tally", "No exact Tally voucher exists."),
        ],
    },
    {
        "file": "03_Nyx_HDFC-Wrong-Bank-Isolation.pdf",
        "company": "Nyx",
        "bank": "HDFC Bank",
        "account": "700001111",
        "opening": 600000,
        "rows": [
            row("2026-07-03", "NEFT DR TO PRAKASH BEARINGS HOUSE", "HDF260703704", 42000, "missing_in_tally", "The matching voucher belongs to Nyx Kotak, not HDFC."),
            row("2026-07-03", "BANK SMS ALERT CHARGES", "CHG260703706", 59, "missing_in_tally", "The matching voucher belongs to Nyx Kotak, not HDFC."),
            row("2026-07-07", "NEFT DR TO NOBLE INDUSTRIAL SUPPLY", "YES260707701", 75000, "missing_in_tally", "The matching voucher belongs to Nyx Kotak, not HDFC."),
            row("2026-07-09", "BANK CHARGES JULY STATEMENT", "CHG260709703", 236, "missing_in_tally", "Kotak duplicate vouchers must not match an HDFC statement."),
        ],
    },
    {
        "file": "04_Solution-Nyx_ICICI-Cross-Company-Isolation.pdf",
        "company": "Solution Nyx",
        "bank": "ICICI Bank",
        "account": "8822014500",
        "opening": 700000,
        "rows": [
            row("2026-07-03", "NEFT DR TO PRAKASH BEARINGS HOUSE", "HDF260703704", 42000, "missing_in_tally", "A Nyx voucher must not match inside Solution Nyx."),
            row("2026-07-03", "BANK SMS ALERT CHARGES", "CHG260703706", 59, "missing_in_tally", "A Nyx voucher must not match inside Solution Nyx."),
            row("2026-07-07", "NEFT DR TO NOBLE INDUSTRIAL SUPPLY", "YES260707701", 75000, "missing_in_tally", "A Nyx voucher must not match inside Solution Nyx."),
            row("2026-07-09", "BANK CHARGES JULY STATEMENT", "CHG260709703", 236, "missing_in_tally", "Nyx duplicates must remain isolated from Solution Nyx."),
        ],
    },
    {
        "file": "05_Nyx_Kotak-Reference-Normalization.pdf",
        "company": "Nyx",
        "bank": "Kotak Mahindra Bank",
        "account": "6713098600",
        "opening": 500000,
        "rows": [
            row("2026-07-03", "NEFT DR TO PRAKASH BEARINGS HOUSE", "HDF-260703-704", 42000, "already_in_tally", "Hyphens and case are ignored for an otherwise exact reference."),
            row("2026-07-03", "BANK SMS ALERT CHARGES", "chg/260703/706", 59, "already_in_tally", "Slash and case formatting normalize to the stored reference."),
            row("2026-07-07", "NEFT DR TO NOBLE INDUSTRIAL SUPPLY", "yes 260707 701", 75000, "already_in_tally", "Spaces and case normalize to the stored reference."),
        ],
    },
    {
        "file": "06_Nyx_Kotak-Voucher-Reuse-Protection.pdf",
        "company": "Nyx",
        "bank": "Kotak Mahindra Bank",
        "account": "6713098600",
        "opening": 500000,
        "rows": [
            row("2026-07-03", "NEFT DR TO PRAKASH BEARINGS HOUSE - BATCH LINE 1", "HDF260703704", 42000, "already_in_tally", "The first statement row may consume the one matching voucher."),
            row("2026-07-03", "NEFT DR TO PRAKASH BEARINGS HOUSE - BATCH LINE 2", "HDF260703704", 42000, "missing_in_tally", "The same Tally voucher must not satisfy a second statement row."),
            row("2026-07-07", "NEFT DR TO NOBLE INDUSTRIAL SUPPLY - BATCH LINE 1", "YES260707701", 75000, "already_in_tally", "The first statement row may consume the one matching voucher."),
            row("2026-07-07", "NEFT DR TO NOBLE INDUSTRIAL SUPPLY - BATCH LINE 2", "YES260707701", 75000, "missing_in_tally", "The same Tally voucher must not satisfy a second statement row."),
        ],
    },
    {
        "file": "07_Nyx_Kotak-Broken-Running-Balance.pdf",
        "company": "Nyx",
        "bank": "Kotak Mahindra Bank",
        "account": "6713098600",
        "opening": 300000,
        "break_balance_at": 2,
        "rows": [
            row("2026-07-03", "NEFT DR TO PRAKASH BEARINGS HOUSE", "HDF260703704", 42000, "already_in_tally", "Row matching remains strict even when the statement balance is invalid."),
            row("2026-07-03", "IMPS DR TO METRO STEEL DEPOT", "SBI260703705", 31000, "missing_in_tally", "No seeded Payment voucher."),
            row("2026-07-03", "BANK SMS ALERT CHARGES", "CHG260703706", 59, "already_in_tally", "Exact voucher, but the statement must show a balance warning."),
            row("2026-07-03", "ACCOUNT MAINTENANCE FEE", "FEE260703002", 472, "missing_in_tally", "No seeded Payment voucher."),
        ],
        "balance_expected": "balance_mismatch_warning",
    },
    {
        "file": "08_Nyx_Kotak-Mismatch-Edges.pdf",
        "company": "Nyx",
        "bank": "Kotak Mahindra Bank",
        "account": "6713098600",
        "opening": 450000,
        "rows": [
            row("2026-07-04", "NEFT DR TO PRAKASH BEARINGS HOUSE", "HDF260703704", 42000, "missing_in_tally", "Correct reference and amount but wrong date."),
            row("2026-07-03", "NEFT DR TO PRAKASH BEARINGS HOUSE", "HDF260703704", 42001, "missing_in_tally", "Correct reference and date but wrong amount."),
            row("2026-07-03", "NEFT DR TO PRAKASH BEARINGS HOUSE", "WRONG260703704", 42000, "missing_in_tally", "Correct date and amount but wrong usable reference."),
            row("2026-07-09", "NEFT DR SUPPLIER PAYMENT SHORT BANK REF", "AB12", 50000, "ambiguous", "A four-character reference is unreliable; multiple amount/date candidates remain."),
        ],
    },
]


def money(value: float) -> str:
    return f"{value:,.2f}"


def prepare_balances(spec: dict) -> tuple[list[dict], float]:
    balance = float(spec["opening"])
    prepared = []
    for index, source in enumerate(spec["rows"]):
        balance -= float(source["withdrawal"])
        shown_balance = balance
        if spec.get("break_balance_at") == index:
            shown_balance += 1000
        prepared.append({**source, "balance": shown_balance})
    return prepared, balance


def build_pdf(spec: dict) -> dict:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT / spec["file"]
    rows, true_closing = prepare_balances(spec)
    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    normal.fontName = "Helvetica"
    normal.fontSize = 8
    normal.leading = 10
    title = styles["Title"]
    title.fontName = "Helvetica-Bold"
    title.fontSize = 18
    title.textColor = colors.HexColor("#1f2937")

    doc = SimpleDocTemplate(
        str(path),
        pagesize=landscape(A4),
        leftMargin=13 * mm,
        rightMargin=13 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )
    period_start = datetime.strptime(rows[0]["date"], "%Y-%m-%d").strftime("%d %b %Y")
    period_end = datetime.strptime(rows[-1]["date"], "%Y-%m-%d").strftime("%d %b %Y")
    total_withdrawals = sum(float(item["withdrawal"]) for item in rows)
    story = [
        Paragraph(spec["bank"], title),
        Paragraph("Account Statement", styles["Heading2"]),
        Paragraph(
            f"Account: {spec['bank']} - {spec['account']} &nbsp;&nbsp;&nbsp; "
            f"Period: {period_start} to {period_end}",
            normal,
        ),
        Paragraph(
            f"Customer: {spec['company']} &nbsp;&nbsp;&nbsp; Opening Balance: {money(spec['opening'])} &nbsp;&nbsp;&nbsp; "
            f"Total Withdrawals: {money(total_withdrawals)} &nbsp;&nbsp;&nbsp; Closing Balance: {money(true_closing)}",
            normal,
        ),
        Spacer(1, 7),
    ]
    table_rows = [["Date", "Narration", "Ref / UTR", "Withdrawal (Dr)", "Deposit (Cr)", "Balance"]]
    for item in rows:
        date_label = datetime.strptime(item["date"], "%Y-%m-%d").strftime("%d %b %Y")
        table_rows.append([
            date_label,
            Paragraph(item["narration"], normal),
            item["reference"],
            money(item["withdrawal"]),
            "",
            money(item["balance"]),
        ])
    table = Table(table_rows, colWidths=[25 * mm, 112 * mm, 45 * mm, 36 * mm, 34 * mm, 36 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3eee7")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#4b4038")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d8ccbc")),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fbfaf8")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([
        table,
        Spacer(1, 8),
        Paragraph("Computer generated test statement. All rows are outgoing bank payments.", normal),
    ])
    doc.build(story)
    return {
        "file": spec["file"],
        "company": spec["company"],
        "bankLedger": f"{spec['bank']} - {spec['account']}",
        "balanceExpected": spec.get("balance_expected", "valid_sequence"),
        "rows": [
            {
                "row": index + 1,
                "date": item["date"],
                "reference": item["reference"],
                "amount": item["withdrawal"],
                "expected": item["expected"],
                "reason": item["reason"],
            }
            for index, item in enumerate(rows)
        ],
    }


def write_readme(manifest: dict):
    lines = [
        "# Outgoing Payment Verification Test Pack",
        "",
        "These statements contain outgoing payments only. Checking them must never create a Tally voucher.",
        "",
        "## Test order",
        "",
    ]
    for pdf in manifest["pdfs"]:
        lines.extend([
            f"### {pdf['file']}",
            "",
            f"- Select company: `{pdf['company']}`",
            f"- Expected bank ledger: `{pdf['bankLedger']}`",
            f"- Balance expectation: `{pdf['balanceExpected']}`",
            "",
            "| Row | Reference | Amount | Expected |",
            "| --- | --- | ---: | --- |",
        ])
        for item in pdf["rows"]:
            lines.append(
                f"| {item['row']} | `{item['reference'] or '(blank)'}` | {money(item['amount'])} | `{item['expected']}` |"
            )
        lines.extend(["", "Upload the same PDF twice. The second run must produce the same classifications and zero new vouchers.", ""])
    lines.extend([
        "## Safety assertions",
        "",
        "1. Record the Tally Payment voucher count before testing.",
        "2. No black posting button should appear because these PDFs contain no receipts.",
        "3. Running Check Tally Matches must not create a Payment, Receipt, Journal, or Contra voucher.",
        "4. The Payment voucher count after all tests must equal the initial count.",
        "5. Wrong-bank and wrong-company statements must never reuse a voucher from another ledger or company.",
    ])
    (OUTPUT / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    pdfs = [build_pdf(spec) for spec in PACK]
    manifest = {
        "pack": "outgoing-payment-verification-v1",
        "generatedOn": datetime.now().isoformat(timespec="seconds"),
        "sourceTallyFixture": "scripts/seed_june_july_bank_cash_discount_pack.mjs",
        "pdfs": pdfs,
    }
    (OUTPUT / "expected-results.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    write_readme(manifest)
    print(json.dumps({"output": str(OUTPUT), "pdfCount": len(pdfs)}, indent=2))


if __name__ == "__main__":
    main()
