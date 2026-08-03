from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Iterable

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT_DIR = Path("output/pdf/packet-intelligence-test-set")


@dataclass(frozen=True)
class DocumentPage:
    document_type: str
    title: str
    fields: list[tuple[str, str]]
    line_items: list[list[str]]
    notes: list[str]
    copy_label: str | None = None


@dataclass(frozen=True)
class Shipment:
    label: str
    buyer: str
    supplier: str
    po_no: str
    invoice_no: str
    eway_no: str
    lr_no: str
    delivery_no: str
    weighment_no: str
    po_date: str
    invoice_date: str
    taxable: str
    tax: str
    total: str
    quantity: str
    weighment_quantity: str
    vehicle: str = "MH20GE0684"
    unit: str = "KG"
    hsn: str = "7204"
    rate: str = "40.00"
    route_from: str = "Mumbai, Maharashtra"
    route_to: str = "Jalna, Maharashtra"
    material: str = "Mild steel scrap"
    supplier_gstin: str = "27AABCS0001Z1A"
    buyer_gstin: str = "27AACCK1502A1ZD"
    po_terms: tuple[str, ...] = (
        "Delivery Terms: Material to reach Kalika store as per dispatch schedule.",
        "Payment Terms: 30 days after receipt and acceptance.",
        "Inspection Terms: Store acceptance required before payment.",
    )
    invoice_notes: tuple[str, ...] = ("Authorized signatory present. Supplier stamp present.",)


@dataclass(frozen=True)
class PacketSpec:
    file_name: str
    expected_kind: str
    upload_note: str
    pages: list[DocumentPage]


TITLE = ParagraphStyle(
    "Title",
    fontName="Helvetica-Bold",
    fontSize=15,
    leading=19,
    textColor=colors.HexColor("#111827"),
    spaceAfter=5,
)
SUBTITLE = ParagraphStyle(
    "Subtitle",
    fontName="Helvetica",
    fontSize=8,
    leading=11,
    textColor=colors.HexColor("#64748b"),
    spaceAfter=9,
)
SECTION = ParagraphStyle(
    "Section",
    fontName="Helvetica-Bold",
    fontSize=8,
    leading=11,
    textColor=colors.HexColor("#334155"),
    spaceBefore=6,
    spaceAfter=4,
)
BODY = ParagraphStyle(
    "Body",
    fontName="Helvetica",
    fontSize=8,
    leading=11,
    textColor=colors.HexColor("#0f172a"),
)
SMALL = ParagraphStyle(
    "Small",
    fontName="Helvetica",
    fontSize=7,
    leading=10,
    textColor=colors.HexColor("#475569"),
)


def kv_table(rows: list[tuple[str, str]]) -> Table:
    table = Table(
        [[Paragraph(k, SMALL), Paragraph(v, BODY)] for k, v in rows],
        colWidths=[43 * mm, 120 * mm],
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d7dce5")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def line_item_table(rows: list[list[str]]) -> Table:
    if not rows:
        return Table([["No line item table on this document."]], colWidths=[163 * mm])

    table_rows = [["Description", "HSN", "Qty", "Unit", "Taxable", "GST", "Tax", "Total"], *rows]
    table = Table(
        table_rows,
        colWidths=[43 * mm, 16 * mm, 15 * mm, 13 * mm, 22 * mm, 14 * mm, 20 * mm, 20 * mm],
        hAlign="LEFT",
        repeatRows=1,
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#334155")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d7dce5")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def note_table(notes: Iterable[str]) -> Table:
    rows = [[Paragraph(note, SMALL)] for note in notes]
    table = Table(rows, colWidths=[163 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#fed7aa")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fff7ed")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def page_story(page: DocumentPage, page_number: int, total_pages: int) -> list:
    story = [
        Paragraph(page.title, TITLE),
        Paragraph(
            f"Page {page_number} of {total_pages}",
            SUBTITLE,
        ),
    ]
    if page.copy_label:
        story.append(Paragraph(page.copy_label, SECTION))
    story.extend([Paragraph("Details", SECTION), kv_table(page.fields)])
    if page.line_items:
        story.extend([Paragraph("Line Items", SECTION), line_item_table(page.line_items)])
    if page.notes:
        story.extend([Paragraph("Remarks / Terms", SECTION), note_table(page.notes)])
    return story


def build_pdf(spec: PacketSpec) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / spec.file_name
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=spec.file_name,
        author="Kalika synthetic test generator",
    )
    story = []
    for index, page in enumerate(spec.pages, start=1):
        if index > 1:
            story.append(PageBreak())
        story.extend(page_story(page, index, len(spec.pages)))
    doc.build(story)


def line_item(shipment: Shipment) -> list[str]:
    return [
        shipment.material,
        shipment.hsn,
        shipment.quantity,
        shipment.unit,
        shipment.taxable,
        "18%",
        shipment.tax,
        shipment.total,
    ]


def purchase_order_page(shipment: Shipment) -> DocumentPage:
    return DocumentPage(
        document_type="Purchase Order",
        title=f"Purchase Order - {shipment.po_no}",
        fields=[
            ("PO Number", shipment.po_no),
            ("PO Date", shipment.po_date),
            ("Vendor Name", shipment.supplier),
            ("Buyer Name", shipment.buyer),
            ("Currency", "INR"),
            ("Item Quantity", shipment.quantity),
            ("Unit", shipment.unit),
            ("Rate", shipment.rate),
            ("Taxable / Basic Amount", shipment.taxable),
            ("Tax Amount", shipment.tax),
            ("Total Amount", shipment.total),
        ],
        line_items=[line_item(shipment)],
        notes=list(shipment.po_terms),
    )


def tax_invoice_page(shipment: Shipment, copy_label: str | None = None) -> DocumentPage:
    title_suffix = f" - {copy_label}" if copy_label else ""
    return DocumentPage(
        document_type="Tax Invoice",
        title=f"Tax Invoice - {shipment.invoice_no}{title_suffix}",
        copy_label=copy_label,
        fields=[
            ("Invoice Number", shipment.invoice_no),
            ("Invoice Date", shipment.invoice_date),
            ("Reference PO Number", shipment.po_no),
            ("E-Way Bill Number", shipment.eway_no),
            ("Supplier Name", shipment.supplier),
            ("Supplier GSTIN", shipment.supplier_gstin),
            ("Buyer Name", shipment.buyer),
            ("Buyer GSTIN", shipment.buyer_gstin),
            ("Vehicle Number", shipment.vehicle),
            ("Currency", "INR"),
            ("Item Quantity", shipment.quantity),
            ("Unit", shipment.unit),
            ("Taxable / Basic Amount", shipment.taxable),
            ("Tax Amount", shipment.tax),
            ("Total Amount", shipment.total),
        ],
        line_items=[line_item(shipment)],
        notes=list(shipment.invoice_notes),
    )


def eway_bill_page(shipment: Shipment) -> DocumentPage:
    return DocumentPage(
        document_type="E-Way Bill",
        title=f"E-Way Bill - {shipment.eway_no}",
        fields=[
            ("E-Way Bill Number", shipment.eway_no),
            ("Reference Invoice Number", shipment.invoice_no),
            ("Document Date", shipment.invoice_date),
            ("Supplier Name", shipment.supplier),
            ("Buyer Name", shipment.buyer),
            ("Vehicle Number", shipment.vehicle),
            ("Route From", shipment.route_from),
            ("Route To", shipment.route_to),
            ("Item Quantity", shipment.quantity),
            ("Unit", shipment.unit),
            ("Total Amount", shipment.total),
        ],
        line_items=[],
        notes=["Generated e-way bill. Valid for the listed vehicle and route."],
    )


def weighment_page(shipment: Shipment) -> DocumentPage:
    return DocumentPage(
        document_type="Weighment Slip",
        title=f"Weighment Slip - {shipment.weighment_no}",
        fields=[
            ("Weighment Number", shipment.weighment_no),
            ("Vehicle Number", shipment.vehicle),
            ("Vendor Name", shipment.supplier),
            ("Buyer Name", shipment.buyer),
            ("Gross Weight", "45,000 KG"),
            ("Tare Weight", "10,000 KG"),
            ("Net Weight", f"{shipment.weighment_quantity} KG"),
            ("Item Quantity", shipment.weighment_quantity),
            ("Unit", shipment.unit),
        ],
        line_items=[],
        notes=["Weighbridge stamp visible. Operator signature visible."],
    )


def lorry_receipt_page(shipment: Shipment) -> DocumentPage:
    return DocumentPage(
        document_type="Lorry Receipt",
        title=f"Lorry Receipt - {shipment.lr_no}",
        fields=[
            ("Lorry Receipt Number", shipment.lr_no),
            ("Invoice Number", shipment.invoice_no),
            ("Transporter Name", "Shree Balaji Roadlines"),
            ("Vendor Name", shipment.supplier),
            ("Buyer Name", shipment.buyer),
            ("Vehicle Number", shipment.vehicle),
            ("Route From", shipment.route_from),
            ("Route To", shipment.route_to),
            ("Item Quantity", shipment.quantity),
            ("Unit", shipment.unit),
        ],
        line_items=[],
        notes=["Driver acknowledgement and transporter stamp visible."],
    )


def delivery_note_page(shipment: Shipment) -> DocumentPage:
    return DocumentPage(
        document_type="Delivery Note",
        title=f"Delivery Note - {shipment.delivery_no}",
        fields=[
            ("Delivery Note Number", shipment.delivery_no),
            ("Reference Invoice Number", shipment.invoice_no),
            ("Reference PO Number", shipment.po_no),
            ("Vendor Name", shipment.supplier),
            ("Buyer Name", shipment.buyer),
            ("Vehicle Number", shipment.vehicle),
            ("Item Quantity", shipment.quantity),
            ("Unit", shipment.unit),
        ],
        line_items=[
            [
                shipment.material,
                shipment.hsn,
                shipment.quantity,
                shipment.unit,
                shipment.taxable,
                "18%",
                shipment.tax,
                shipment.total,
            ]
        ],
        notes=["Store receiver signature present. Material description matches invoice."],
    )


def complete_shipment_pages(shipment: Shipment) -> list[DocumentPage]:
    return [
        purchase_order_page(shipment),
        tax_invoice_page(shipment),
        eway_bill_page(shipment),
        weighment_page(shipment),
        lorry_receipt_page(shipment),
        delivery_note_page(shipment),
    ]


def shipment(
    label: str,
    buyer: str,
    supplier: str,
    po_no: str,
    invoice_no: str,
    eway_no: str,
    amount_seed: str,
    quantity: str,
    **overrides: object,
) -> Shipment:
    base = Shipment(
        label=label,
        buyer=buyer,
        supplier=supplier,
        po_no=po_no,
        invoice_no=invoice_no,
        eway_no=eway_no,
        lr_no=f"LR/26-27/{amount_seed}",
        delivery_no=f"DN/26-27/{amount_seed}",
        weighment_no=f"WB/26-27/{amount_seed}",
        po_date="20-Jun-2026",
        invoice_date="30-Jun-2026",
        taxable="1,00,000",
        tax="18,000",
        total="1,18,000",
        quantity=quantity,
        weighment_quantity=quantity,
        rate="10.00",
    )
    return replace(base, **overrides)


def packet_specs() -> list[PacketSpec]:
    kalika = "KALIKA STEEL ALLOYS PVT LTD"

    single = shipment(
        "MAT packet",
        kalika,
        "MAHARASHTRA ALLOY TRADERS",
        "RM/25-26/PR26Y-0101",
        "INV-A-1001",
        "271214900101",
        "0101",
        "35,550",
        taxable="3,55,500",
        tax="63,990",
        total="4,19,490",
        rate="10.00",
        weighment_quantity="35,460",
    )

    duplicate_copies = shipment(
        "Concast packet",
        kalika,
        "CONCAST (INDIA) PRIVATE LIMITED",
        "RM/25-26/PR26Y-0211",
        "CG0202600211",
        "271214900211",
        "0211",
        "25,000",
        taxable="2,50,000",
        tax="45,000",
        total="2,95,000",
    )

    duplicate_upload = shipment(
        "Saniya packet",
        kalika,
        "SANIYA ENTERPRISES",
        "RM/25-26/PR26Y-00365",
        "1653",
        "292214235556",
        "0365",
        "25,000",
    )

    same_company_a = shipment(
        "Tapi packet 72",
        kalika,
        "TAPI STEEL FABRICATORS",
        "RM/25-26/PR26Y-00290",
        "TSF72",
        "252211466889",
        "0290",
        "10,000",
    )
    same_company_b = shipment(
        "Tapi packet 73",
        kalika,
        "TAPI STEEL FABRICATORS",
        "RM/25-26/PR26Y-00291",
        "TSF73",
        "252211466890",
        "0291",
        "20,000",
        taxable="2,00,000",
        tax="36,000",
        total="2,36,000",
    )

    different_company_a = shipment(
        "Axis packet",
        kalika,
        "AXIS ENGINEERING CORPORATION",
        "RM/25-26/PR26Y-00350",
        "AEC/26-27/0564",
        "271214900350",
        "0350",
        "10,000",
    )
    different_company_b = shipment(
        "VG packet",
        "RMILL INDIA PRIVATE LIMITED",
        "VG ENGINEERING SUPPLIERS PVT LTD",
        "RM/25-26/PR26Y-00356",
        "VG/26-27/302",
        "271214900356",
        "0356",
        "20,000",
        taxable="2,00,000",
        tax="36,000",
        total="2,36,000",
        buyer_gstin="27AAACR9999Z1Z",
    )

    upstream = shipment(
        "Alpha invoice",
        "STEEL JUNCTIONS PRIVATE LIMITED",
        "ALPHA SCRAP SUPPLIERS",
        "SJ/PO/26-27/118",
        "AS/26-27/441",
        "271214900441",
        "0441",
        "10,000",
        tax="10,000",
        total="1,10,000",
        buyer_gstin="27AAECS1111Z1Z",
        invoice_notes=("Goods supplied against buyer purchase order. Supplier stamp present.",),
    )
    kalika_facing = shipment(
        "Synergie invoice",
        kalika,
        "STEEL JUNCTIONS PRIVATE LIMITED",
        "RM/25-26/PR25Y-02456",
        "SCS/T/26-27/0034",
        "271214900456",
        "2456",
        "10,000",
        invoice_notes=("Goods dispatched to buyer works. Supplier stamp present.",),
    )

    tax_issue = shipment(
        "Pune Ferro packet",
        kalika,
        "PUNE FERRO TRADERS",
        "RM/25-26/PR26Y-5001",
        "INV-NUM-A-001",
        "271214905001",
        "5001",
        "25,000",
        taxable="6,00,000",
        tax="0",
        total="6,00,000",
        rate="24.00",
        invoice_notes=(
            "Computer generated invoice. Supplier stamp present.",
            "Tax column printed as INR 0.",
        ),
    )

    terms_issue = shipment(
        "Electrotherm packet",
        kalika,
        "ELECTROTHERM INDIA LTD",
        "RM/25-26/PR26Y-8001",
        "ET/26-27/8001",
        "271214908001",
        "8001",
        "25,000",
        taxable="5,00,000",
        tax="90,000",
        total="5,90,000",
        po_date="01-Jun-2026",
        invoice_date="30-Jun-2026",
        po_terms=(
            "Delivery Terms: Material must reach Kalika store before 15-Jun-2026.",
            "Payment Terms: 30 days after receipt and acceptance.",
            "Inspection Terms: Store acceptance required before payment.",
        ),
    )

    ambiguous = shipment(
        "Concord Hydraulics packet",
        kalika,
        "CONCORD HYDRAULICS PVT LTD",
        "RM/25-26/PR26Y-086",
        "CHM086",
        "271214900086",
        "0086",
        "25,000",
        invoice_notes=(
            "Handwritten correction visible near PO number: RM/25-26/PR26Y-086A.",
            "Supplier stamp and authorized signature present.",
        ),
    )
    ambiguous_eway = eway_bill_page(replace(ambiguous, invoice_no="CHM086A"))

    return [
        PacketSpec(
            file_name="MAT_INV_A_1001_PACKET.pdf",
            expected_kind="single_shipment",
            upload_note="Complete one-shipment packet. It should stay one case and show the weighment quantity mismatch.",
            pages=complete_shipment_pages(single),
        ),
        PacketSpec(
            file_name="CG0202600211_PACKET.pdf",
            expected_kind="duplicate_document_copies",
            upload_note="Complete packet with original, duplicate, and transporter invoice copies. It should collapse copies as one evidence source.",
            pages=[
                purchase_order_page(duplicate_copies),
                tax_invoice_page(duplicate_copies, "Original for Recipient"),
                tax_invoice_page(duplicate_copies, "Duplicate for Transporter"),
                tax_invoice_page(duplicate_copies, "Triplicate for Supplier"),
                eway_bill_page(duplicate_copies),
                weighment_page(duplicate_copies),
                lorry_receipt_page(duplicate_copies),
                delivery_note_page(duplicate_copies),
            ],
        ),
        PacketSpec(
            file_name="SANIYA_1653_PACKET.pdf",
            expected_kind="duplicate_upload",
            upload_note="Upload this complete packet once, then upload SANIYA_1653_PACKET_RESCAN.pdf to test duplicate-upload detection.",
            pages=complete_shipment_pages(duplicate_upload),
        ),
        PacketSpec(
            file_name="TAPI_JUN_2026_DISPATCH_SET.pdf",
            expected_kind="multi_shipment_same_company",
            upload_note="One PDF with two complete shipments for the same company. It should split into two invoice-led cases.",
            pages=[*complete_shipment_pages(same_company_a), *complete_shipment_pages(same_company_b)],
        ),
        PacketSpec(
            file_name="RMI_JUN_2026_DISPATCH_SET.pdf",
            expected_kind="multi_shipment_different_companies",
            upload_note="One PDF with two complete shipments for different buyer companies. It should split into separate cases.",
            pages=[*complete_shipment_pages(different_company_a), *complete_shipment_pages(different_company_b)],
        ),
        PacketSpec(
            file_name="SCS_T_26_27_0034_PACKET.pdf",
            expected_kind="seller_chain",
            upload_note="Complete upstream packet plus complete Kalika-facing resale packet. The Kalika-facing invoice should be primary.",
            pages=[*complete_shipment_pages(upstream), *complete_shipment_pages(kalika_facing)],
        ),
        PacketSpec(
            file_name="PUNE_FERRO_INV_NUM_A_001_PACKET.pdf",
            expected_kind="tax_calculation_issue",
            upload_note="Complete packet where invoice tax is printed as zero despite Maharashtra GST rule. It should show expected vs extracted tax.",
            pages=complete_shipment_pages(tax_issue),
        ),
        PacketSpec(
            file_name="ET_26_27_8001_PACKET.pdf",
            expected_kind="terms_and_conditions_issue",
            upload_note="Complete packet where PO delivery deadline is before invoice/e-way dates. It should show a terms issue.",
            pages=complete_shipment_pages(terms_issue),
        ),
        PacketSpec(
            file_name="CHM086_PACKET.pdf",
            expected_kind="needs_review",
            upload_note="Complete packet with an ambiguous handwritten PO/invoice correction. It should ask for careful review rather than auto-approval.",
            pages=[
                purchase_order_page(ambiguous),
                tax_invoice_page(ambiguous),
                ambiguous_eway,
                weighment_page(ambiguous),
                lorry_receipt_page(ambiguous),
                delivery_note_page(ambiguous),
            ],
        ),
    ]


def write_readme(specs: list[PacketSpec]) -> None:
    lines = [
        "# Packet Intelligence Synthetic PDF Test Set",
        "",
        "Every PDF in this folder is now a complete packet-style upload.",
        "A normal shipment includes a purchase order, tax invoice, e-way bill, weighment slip, lorry receipt, and delivery note.",
        "Multi-shipment PDFs include a full mini-packet for each shipment, so split behavior can be tested realistically.",
        "",
        "For duplicate-upload testing, upload `SANIYA_1653_PACKET.pdf` once, then upload `SANIYA_1653_PACKET_RESCAN.pdf` as a second case.",
        "",
        "| File | Expected UI kind | How to test |",
        "|---|---|---|",
    ]
    for spec in specs:
        lines.append(f"| `{spec.file_name}` | `{spec.expected_kind}` | {spec.upload_note} |")
    lines.extend(
        [
            "",
            "Notes:",
            "- These are synthetic, OCR-friendly documents with explicit field labels.",
            "- Use them for UI/UX validation, not accounting evidence.",
            "- If extraction misses a field, that points to prompt/classification work rather than PDF completeness.",
        ]
    )
    (OUTPUT_DIR / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    if OUTPUT_DIR.exists():
        for file_path in OUTPUT_DIR.glob("*"):
            if file_path.is_file():
                file_path.unlink()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    specs = packet_specs()
    for spec in specs:
        build_pdf(spec)

    duplicate_source = OUTPUT_DIR / "SANIYA_1653_PACKET.pdf"
    duplicate_copy = OUTPUT_DIR / "SANIYA_1653_PACKET_RESCAN.pdf"
    shutil.copyfile(duplicate_source, duplicate_copy)

    manifest = [
        {
            "file": spec.file_name,
            "expectedKind": spec.expected_kind,
            "uploadNote": spec.upload_note,
            "pageCount": len(spec.pages),
            "completePacket": True,
        }
        for spec in specs
    ]
    manifest.append(
        {
            "file": "SANIYA_1653_PACKET_RESCAN.pdf",
            "expectedKind": "duplicate_upload",
            "uploadNote": "Exact content copy of SANIYA_1653_PACKET.pdf. Upload after the original.",
            "pageCount": len(packet_specs()[2].pages),
            "completePacket": True,
        }
    )
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    write_readme(specs)
    print(f"Generated {len(specs) + 1} complete-packet PDFs in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
