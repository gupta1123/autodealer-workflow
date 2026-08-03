from __future__ import annotations

import json
import shutil
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "multi-company-bank-workflow-v1"
MANIFEST = OUT / "manifest.json"


def money(value):
    if value is None:
        return ""
    return f"{float(value):,.2f}"


def paragraph(text, style):
    return Paragraph(str(text).replace("&", "&amp;"), style)


def create_statement(spec):
    output_path = OUT / spec["fileName"]
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=landscape(A4),
        leftMargin=8 * mm,
        rightMargin=8 * mm,
        topMargin=9 * mm,
        bottomMargin=9 * mm,
    )
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=7.5, leading=9, textColor=colors.HexColor("#171717"))
    small = ParagraphStyle("small", parent=body, fontSize=7, leading=8)
    heading = ParagraphStyle("heading", parent=body, fontName="Helvetica-Bold", fontSize=17, leading=20)
    subheading = ParagraphStyle("subheading", parent=body, fontName="Helvetica-Bold", fontSize=11, leading=13)
    story = [
        Paragraph(spec["bankName"], heading),
        Spacer(1, 4 * mm),
        Paragraph("Account Statement", subheading),
        Spacer(1, 2 * mm),
        Paragraph(
            f'Account: {spec["bankName"]} - {spec["accountNumber"]}&nbsp;&nbsp;&nbsp;&nbsp;'
            f'Period: {spec["period"]}<br/>Customer: {spec["companyName"]}',
            body,
        ),
        Spacer(1, 3 * mm),
    ]

    data = [[
        "Date",
        "Narration",
        "Ref / UTR",
        "Withdrawal (Dr)",
        "Deposit (Cr)",
        "Balance",
    ]]
    for row in spec["transactions"]:
        data.append([
            paragraph(row["date"], small),
            paragraph(row["narration"], small),
            paragraph(row["reference"], small),
            money(row.get("debit")),
            money(row.get("credit")),
            money(row["balance"]),
        ])

    table = Table(data, colWidths=[22 * mm, 108 * mm, 43 * mm, 32 * mm, 32 * mm, 34 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eee9e1")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#524a42")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7.5),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d9d0c5")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#faf8f5")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([table, Spacer(1, 3 * mm), Paragraph("This statement is system generated and does not require a signature.", small)])
    doc.build(story)
    return output_path


def create_readme(manifest):
    lines = [
        "# Multi-company Bank Workflow V1",
        "",
        f'Test tag: `{manifest["tag"]}`',
        "",
        "## PDFs",
        "",
    ]
    for spec in manifest["pdfs"]:
        lines.append(f'- `{spec["fileName"]}` - {spec["companyName"]} / {spec["bankLedger"]}')
    lines.extend([
        "",
        "## Run order",
        "",
        "1. Keep Tally on Nyx and upload PDFs 01 and 02.",
        "2. Select Solution Nyx while Tally is still on Nyx; confirm the app blocks the workflow.",
        "3. Switch Tally to Solution Nyx, refresh, and upload PDF 03.",
        "4. Re-upload each PDF to verify duplicate protection.",
        "",
        "See `manifest.json` for transaction-level expected results and seeded references.",
    ])
    (OUT / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    created = []
    for spec in manifest["pdfs"]:
        target = OUT / spec["fileName"]
        if spec["source"] == "existing":
            shutil.copy2(manifest["existingPdf"], target)
            created.append(target)
        else:
            created.append(create_statement(spec))
    create_readme(manifest)
    print(json.dumps({"created": [str(path) for path in created]}, indent=2))


if __name__ == "__main__":
    main()
