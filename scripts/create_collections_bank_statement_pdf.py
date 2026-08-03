from __future__ import annotations

import json
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def money(value: float | int | None) -> str:
    if value is None:
        return ""
    return f"{value:,.2f}"


def build_pdf(manifest_path: Path) -> Path:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    output_path = Path(manifest["pdfPath"])
    output_path.parent.mkdir(parents=True, exist_ok=True)

    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    normal.fontName = "Helvetica"
    normal.fontSize = 8
    normal.leading = 10

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=landscape(A4),
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )

    story = []
    story.append(Paragraph("<b>Kotak Mahindra Bank</b>", styles["Title"]))
    story.append(Paragraph("Account Statement", styles["Heading2"]))
    story.append(
        Paragraph(
            f"Account: {manifest['bankAccountName']} - {manifest['accountNumber']} &nbsp;&nbsp; "
            f"Period: {manifest['statementPeriodStartLabel']} to {manifest['statementPeriodEndLabel']}",
            normal,
        )
    )
    story.append(Paragraph(f"Customer: {manifest['accountHolderName']}", normal))
    story.append(Spacer(1, 8))

    rows = [["Date", "Narration", "Ref / UTR", "Withdrawal (Dr)", "Deposit (Cr)", "Balance"]]
    for transaction in manifest["transactions"]:
        rows.append(
            [
                transaction["dateLabel"],
                Paragraph(transaction["narration"], normal),
                transaction["reference"],
                money(transaction.get("debit")),
                money(transaction.get("credit")),
                money(transaction["balance"]),
            ]
        )

    table = Table(rows, colWidths=[24 * mm, 125 * mm, 42 * mm, 34 * mm, 34 * mm, 34 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
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
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "Computer generated statement for Kalika collections and bank posting test flow.",
            normal,
        )
    )

    doc.build(story)
    return output_path


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: create_collections_bank_statement_pdf.py <manifest.json>")
    print(build_pdf(Path(sys.argv[1]).resolve()))
