from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "tally-inventory-settings-test-pack"
TMP = ROOT / "tmp" / "pdfs" / "tally-inventory-settings-test-pack"
RENDERER = (
    Path.home()
    / ".cache"
    / "codex-runtimes"
    / "codex-primary-runtime"
    / "dependencies"
    / "native"
    / "poppler"
    / "Library"
    / "bin"
    / "pdftoppm.exe"
)

PAGE_W, PAGE_H = A4
MARGIN = 38

NAVY = colors.HexColor("#16324F")
GREEN = colors.HexColor("#0F7B5B")
PALE_GREEN = colors.HexColor("#EAF7F2")
PALE_BLUE = colors.HexColor("#EFF5FA")
INK = colors.HexColor("#182230")
MUTED = colors.HexColor("#667085")
LINE = colors.HexColor("#D7E0E8")
WHITE = colors.white

BUYER_NAME = "Solution Nyx"
BUYER_GSTIN = "27BBBBB0000B1Z5"
SUPPLIER_NAME = "Surya Steel Trading Company"
SUPPLIER_GSTIN = "27ASJPB7381E1ZQ"
ITEM_NAME = "M S Scrap & Sponge Iron"
HSN = "72044900"
UNIT = "MT"
QUANTITY = 12.66
RATE = 33000.00
TAXABLE = 417780.00
CGST = 37600.20
SGST = 37600.20
ROUND_OFF = -0.40
TOTAL = 492980.00


@dataclass(frozen=True)
class Scenario:
    scenario_id: str
    filename: str
    invoice_number: str
    storage_location: str | None
    batch_number: str | None
    tally_settings: tuple[str, ...]
    tally_masters: tuple[str, ...]
    reviewer_action: str
    expected: str
    expected_result: str
    rationale: str


SCENARIOS = [
    Scenario(
        "G01",
        "G01-no-godown-no-batch.pdf",
        "SSTC/INV/26-27/G01",
        None,
        None,
        (
            "Maintain multiple godowns: No",
            f"Maintain batches for {ITEM_NAME}: No",
        ),
        (f"Stock item: {ITEM_NAME}",),
        "Leave godown and batch unset. Keep all optional deduction toggles off.",
        "GOOD",
        "Posting succeeds without BATCHALLOCATIONS.LIST.",
        "Baseline proves the purchase voucher works when inventory allocation is not required.",
    ),
    Scenario(
        "G02",
        "G02-valid-main-location.pdf",
        "SSTC/INV/26-27/G02",
        "Main Location",
        None,
        (
            "Maintain multiple godowns: Yes",
            f"Maintain batches for {ITEM_NAME}: No",
        ),
        (f"Stock item: {ITEM_NAME}", "Godown: Main Location"),
        "Select Main Location from the live Tally godown list.",
        "GOOD",
        "Posting succeeds and the quantity is allocated to Main Location.",
        "Valid explicit godown allocation using the local company's existing godown.",
    ),
    Scenario(
        "G03",
        "G03-valid-scrap-yard.pdf",
        "SSTC/INV/26-27/G03",
        "Scrap Yard",
        None,
        (
            "Maintain multiple godowns: Yes",
            f"Maintain batches for {ITEM_NAME}: No",
        ),
        (f"Stock item: {ITEM_NAME}", "Godown: Scrap Yard"),
        "Create Scrap Yard first, refresh live masters, then select Scrap Yard.",
        "GOOD",
        "Posting succeeds and the quantity is allocated to Scrap Yard.",
        "Proves the connector uses a selected live godown rather than a hard-coded default.",
    ),
    Scenario(
        "G04",
        "G04-no-location-reviewer-selects-live.pdf",
        "SSTC/INV/26-27/G04",
        None,
        None,
        (
            "Maintain multiple godowns: Yes",
            f"Maintain batches for {ITEM_NAME}: No",
        ),
        (f"Stock item: {ITEM_NAME}", "Godown: Main Location"),
        "Because the invoice states no location, manually select Main Location from live Tally.",
        "GOOD",
        "Posting succeeds after an explicit reviewer selection.",
        "Missing location evidence must not make the app invent a godown name.",
    ),
    Scenario(
        "G05",
        "G05-valid-godown-and-batch.pdf",
        "SSTC/INV/26-27/G05",
        "Scrap Yard",
        "TEST-BATCH-001",
        (
            "Maintain multiple godowns: Yes",
            f"Maintain batches for {ITEM_NAME}: Yes",
        ),
        (
            f"Stock item: {ITEM_NAME}",
            "Godown: Scrap Yard",
            "Batch: TEST-BATCH-001 under Scrap Yard",
        ),
        "Refresh live masters and select both Scrap Yard and TEST-BATCH-001.",
        "GOOD",
        "Posting succeeds with a complete batch allocation.",
        "Positive test for the most restrictive inventory configuration.",
    ),
    Scenario(
        "B01",
        "B01-stale-temporary-yard.pdf",
        "SSTC/INV/26-27/B01",
        "Temporary Yard",
        None,
        (
            "Maintain multiple godowns: Yes",
            f"Maintain batches for {ITEM_NAME}: No",
            "Create Temporary Yard, refresh once, then rename it to Raw Material Store before opening this case.",
        ),
        (f"Stock item: {ITEM_NAME}", "Godowns: Main Location and Raw Material Store"),
        "Do not accept the PDF text as a live master. Leave the mapping unresolved.",
        "BAD",
        "App blocks approval with a godown selection warning; no Tally command is sent.",
        "Reproduces a stale invoice location that no longer exists in the active Tally company.",
    ),
    Scenario(
        "B02",
        "B02-unknown-ghost-yard.pdf",
        "SSTC/INV/26-27/B02",
        "Ghost Yard",
        None,
        (
            "Maintain multiple godowns: Yes",
            f"Maintain batches for {ITEM_NAME}: No",
        ),
        (f"Stock item: {ITEM_NAME}", "Godown: Main Location only"),
        "Do not create Ghost Yard and do not substitute Main Location automatically.",
        "BAD",
        "App requires a live godown selection and must never post Ghost Yard.",
        "Tests rejection of a location that appears in the PDF but not in live Tally.",
    ),
    Scenario(
        "B03",
        "B03-batch-required-but-missing.pdf",
        "SSTC/INV/26-27/B03",
        "Main Location",
        None,
        (
            "Maintain multiple godowns: Yes",
            f"Maintain batches for {ITEM_NAME}: Yes",
        ),
        (f"Stock item: {ITEM_NAME}", "Godown: Main Location"),
        "Do not enter a batch. Attempt Save and check, then attempt approval only if allowed.",
        "BAD",
        "Preflight should require a batch. If approval is possible, record it as a defect and do not rely on Tally's generic import exception.",
        "Tests a batch-tracked stock item when neither the invoice nor reviewer supplies a batch.",
    ),
    Scenario(
        "B04",
        "B04-valid-batch-invalid-godown.pdf",
        "SSTC/INV/26-27/B04",
        "Ghost Yard",
        "TEST-BATCH-001",
        (
            "Maintain multiple godowns: Yes",
            f"Maintain batches for {ITEM_NAME}: Yes",
        ),
        (
            f"Stock item: {ITEM_NAME}",
            "Godown: Main Location only",
            "Batch: TEST-BATCH-001 under Main Location",
        ),
        "Do not create Ghost Yard. The valid batch must not make the invalid godown acceptable.",
        "BAD",
        "App blocks the godown mapping and sends no posting command.",
        "Proves godown and batch are independently validated against their live hierarchy.",
    ),
]


def money(value: float) -> str:
    return f"INR {value:,.2f}"


def fit_text(c: canvas.Canvas, text: str, x: float, y: float, max_width: float, font: str, size: float) -> None:
    value = str(text)
    if stringWidth(value, font, size) <= max_width:
        c.setFont(font, size)
        c.drawString(x, y, value)
        return
    while value and stringWidth(value + "...", font, size) > max_width:
        value = value[:-1]
    c.setFont(font, size)
    c.drawString(x, y, value + "...")


def label_value(c: canvas.Canvas, x: float, y: float, label: str, value: str, width: float) -> None:
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(x, y, label.upper())
    c.setFillColor(INK)
    fit_text(c, value, x, y - 16, width, "Helvetica-Bold", 9)


def draw_invoice(scenario: Scenario) -> None:
    path = OUTPUT / scenario.filename
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    c.setTitle(f"Synthetic purchase invoice {scenario.invoice_number}")
    c.setAuthor("Kalika test tooling")

    c.setFillColor(NAVY)
    c.rect(0, PAGE_H - 94, PAGE_W, 94, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(MARGIN, PAGE_H - 51, "TAX INVOICE")
    c.setFont("Helvetica", 8)
    c.drawString(MARGIN, PAGE_H - 69, "Synthetic document for controlled Tally purchase-posting tests")
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 49, scenario.invoice_number)
    c.setFont("Helvetica", 7.5)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 68, "Original for recipient")

    y = PAGE_H - 124
    half = (PAGE_W - 2 * MARGIN - 14) / 2
    for x, heading, name, gstin, address in [
        (MARGIN, "SUPPLIER", SUPPLIER_NAME, SUPPLIER_GSTIN, "Maharashtra, India"),
        (MARGIN + half + 14, "BUYER", BUYER_NAME, BUYER_GSTIN, "Maharashtra, India"),
    ]:
        c.setFillColor(PALE_BLUE)
        c.setStrokeColor(LINE)
        c.roundRect(x, y - 78, half, 78, 8, fill=1, stroke=1)
        c.setFillColor(GREEN)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(x + 12, y - 16, heading)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(x + 12, y - 35, name)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(x + 12, y - 51, f"GSTIN: {gstin}")
        c.drawString(x + 12, y - 65, address)

    y -= 104
    meta_width = (PAGE_W - 2 * MARGIN) / 4
    metadata = [
        ("Invoice date", "21-08-2026"),
        ("Place of supply", "Maharashtra (27)"),
        ("Vehicle", "MH12FZ7225"),
        ("Reverse charge", "No"),
    ]
    for index, (label, value) in enumerate(metadata):
        label_value(c, MARGIN + index * meta_width, y, label, value, meta_width - 10)

    y -= 54
    c.setFillColor(PALE_GREEN)
    c.roundRect(MARGIN, y - 26, PAGE_W - 2 * MARGIN, 26, 6, fill=1, stroke=0)
    headers = ["DESCRIPTION", "HSN", "QTY", "UNIT", "RATE", "TAXABLE VALUE"]
    widths = [190, 65, 48, 45, 78, 90]
    x = MARGIN
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 6.7)
    for header, width in zip(headers, widths):
        c.drawString(x + 7, y - 17, header)
        x += width

    y -= 26
    c.setStrokeColor(LINE)
    c.setFillColor(WHITE)
    c.rect(MARGIN, y - 52, PAGE_W - 2 * MARGIN, 52, fill=1, stroke=1)
    values = [ITEM_NAME, HSN, f"{QUANTITY:.2f}", UNIT, money(RATE), money(TAXABLE)]
    x = MARGIN
    c.setFillColor(INK)
    for value, width in zip(values, widths):
        fit_text(c, value, x + 7, y - 22, width - 14, "Helvetica-Bold", 8)
        x += width
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(MARGIN + 7, y - 39, "Ferrous scrap purchase - exact Tally stock-item name used")

    y -= 82
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN, y, "Delivery and inventory references")
    y -= 18
    c.setFillColor(PALE_BLUE)
    c.setStrokeColor(LINE)
    c.roundRect(MARGIN, y - 64, PAGE_W - 2 * MARGIN, 64, 8, fill=1, stroke=1)
    location = scenario.storage_location or "Not stated on supplier invoice"
    batch = scenario.batch_number or "Not stated on supplier invoice"
    label_value(c, MARGIN + 14, y - 16, "Storage / delivery location", location, 225)
    label_value(c, MARGIN + 274, y - 16, "Supplier batch / lot", batch, 225)

    y -= 94
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN, y, "Tax summary")
    y -= 18
    rows = [
        ("Taxable value", money(TAXABLE)),
        ("Input CGST @ 9%", money(CGST)),
        ("Input SGST @ 9%", money(SGST)),
        ("Round off", money(ROUND_OFF)),
    ]
    for index, (label, value) in enumerate(rows):
        row_y = y - index * 27
        c.setStrokeColor(LINE)
        c.line(MARGIN, row_y - 20, PAGE_W - MARGIN, row_y - 20)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(MARGIN + 8, row_y - 13, label)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawRightString(PAGE_W - MARGIN - 8, row_y - 13, value)

    y -= 130
    c.setFillColor(NAVY)
    c.roundRect(MARGIN, y - 54, PAGE_W - 2 * MARGIN, 54, 8, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN + 14, y - 20, "INVOICE TOTAL")
    c.setFont("Helvetica-Bold", 18)
    c.drawRightString(PAGE_W - MARGIN - 14, y - 34, money(TOTAL))
    c.setFont("Helvetica", 7)
    c.drawString(MARGIN + 14, y - 38, "Rupees four lakh ninety-two thousand nine hundred eighty only")

    c.saveState()
    c.setFillColor(colors.Color(0.55, 0.1, 0.1, alpha=0.07))
    c.translate(PAGE_W / 2, PAGE_H / 2)
    c.rotate(32)
    c.setFont("Helvetica-Bold", 38)
    c.drawCentredString(0, 0, "SYNTHETIC TEST INVOICE")
    c.restoreState()

    c.setStrokeColor(LINE)
    c.line(MARGIN, 43, PAGE_W - MARGIN, 43)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(MARGIN, 29, "Not a legal or commercial document. Use only in the Solution Nyx local test company.")
    c.drawRightString(PAGE_W - MARGIN, 29, f"Controlled case {scenario.scenario_id}")
    c.showPage()
    c.save()


PACKET_DOCUMENTS = (
    "PURCHASE ORDER",
    "TAX INVOICE",
    "DELIVERY CHALLAN",
    "WEIGHMENT SLIP",
    "E-WAY BILL",
)


def packet_document_reference(scenario: Scenario, page_number: int, sequence: int) -> str:
    if page_number == 1:
        return f"SNX/PO/26-27/{scenario.scenario_id}"
    if page_number == 2:
        return scenario.invoice_number
    if page_number == 3:
        return f"SSTC/DC/26-27/{scenario.scenario_id}"
    if page_number == 4:
        return f"WB/SNX/0826/{scenario.scenario_id}"
    return str(271260821000 + sequence)


def packet_page_frame(
    c: canvas.Canvas,
    scenario: Scenario,
    page_number: int,
    sequence: int,
) -> tuple[str, str]:
    title = PACKET_DOCUMENTS[page_number - 1]
    reference = packet_document_reference(scenario, page_number, sequence)
    c.setFillColor(NAVY)
    c.rect(0, PAGE_H - 94, PAGE_W, 94, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(MARGIN, PAGE_H - 51, title)
    c.setFont("Helvetica", 8)
    c.drawString(MARGIN, PAGE_H - 69, "Synthetic document in a controlled Tally purchase-posting packet")
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 49, reference)
    c.setFont("Helvetica", 7.5)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 68, f"Controlled case {scenario.scenario_id}")
    return title, reference


def packet_page_footer(c: canvas.Canvas, scenario: Scenario, page_number: int) -> None:
    c.saveState()
    c.setFillColor(colors.Color(0.55, 0.1, 0.1, alpha=0.055))
    c.translate(PAGE_W / 2, PAGE_H / 2)
    c.rotate(32)
    c.setFont("Helvetica-Bold", 36)
    c.drawCentredString(0, 0, "SYNTHETIC TEST PACKET")
    c.restoreState()
    c.setStrokeColor(LINE)
    c.line(MARGIN, 43, PAGE_W - MARGIN, 43)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(MARGIN, 29, "Not a legal or commercial document. Use only in the Solution Nyx local test company.")
    c.drawRightString(PAGE_W - MARGIN, 29, f"{scenario.scenario_id} | Page {page_number} of 5")


def packet_party_cards(c: canvas.Canvas, y: float) -> float:
    half = (PAGE_W - 2 * MARGIN - 14) / 2
    for x, heading, name, gstin in (
        (MARGIN, "SUPPLIER", SUPPLIER_NAME, SUPPLIER_GSTIN),
        (MARGIN + half + 14, "BUYER", BUYER_NAME, BUYER_GSTIN),
    ):
        c.setFillColor(PALE_BLUE)
        c.setStrokeColor(LINE)
        c.roundRect(x, y - 72, half, 72, 8, fill=1, stroke=1)
        c.setFillColor(GREEN)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(x + 12, y - 16, heading)
        c.setFillColor(INK)
        fit_text(c, name, x + 12, y - 36, half - 24, "Helvetica-Bold", 11)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(x + 12, y - 53, f"GSTIN: {gstin}")
        c.drawString(x + 12, y - 66, "Maharashtra, India")
    return y - 92


def packet_metadata(c: canvas.Canvas, y: float, entries: list[tuple[str, str]]) -> float:
    width = (PAGE_W - 2 * MARGIN) / len(entries)
    for index, (label, value) in enumerate(entries):
        label_value(c, MARGIN + index * width, y, label, value, width - 10)
    return y - 48


def packet_item_table(c: canvas.Canvas, y: float, show_rate: bool = True) -> float:
    if show_rate:
        headers = ["DESCRIPTION", "HSN", "QTY", "UNIT", "RATE", "TAXABLE VALUE"]
        widths = [190, 65, 48, 45, 78, 90]
        values = [ITEM_NAME, HSN, f"{QUANTITY:.2f}", UNIT, money(RATE), money(TAXABLE)]
    else:
        headers = ["DESCRIPTION", "HSN", "QUANTITY", "UNIT", "VEHICLE"]
        widths = [235, 75, 70, 55, 81]
        values = [ITEM_NAME, HSN, f"{QUANTITY:.2f}", UNIT, "MH12FZ7225"]
    total_width = sum(widths)
    c.setFillColor(PALE_GREEN)
    c.roundRect(MARGIN, y - 26, total_width, 26, 6, fill=1, stroke=0)
    x = MARGIN
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 6.7)
    for header, width in zip(headers, widths):
        c.drawString(x + 7, y - 17, header)
        x += width
    y -= 26
    c.setStrokeColor(LINE)
    c.setFillColor(WHITE)
    c.rect(MARGIN, y - 52, total_width, 52, fill=1, stroke=1)
    x = MARGIN
    c.setFillColor(INK)
    for value, width in zip(values, widths):
        fit_text(c, value, x + 7, y - 22, width - 14, "Helvetica-Bold", 8)
        x += width
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(MARGIN + 7, y - 39, "Ferrous scrap purchase - exact Tally stock-item name used")
    return y - 76


def packet_inventory_references(
    c: canvas.Canvas,
    scenario: Scenario,
    y: float,
    document_name: str,
) -> float:
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN, y, "Delivery and inventory references")
    y -= 18
    c.setFillColor(PALE_BLUE)
    c.setStrokeColor(LINE)
    c.roundRect(MARGIN, y - 64, PAGE_W - 2 * MARGIN, 64, 8, fill=1, stroke=1)
    location = scenario.storage_location or f"Not stated on {document_name.lower()}"
    batch = scenario.batch_number or f"Not stated on {document_name.lower()}"
    label_value(c, MARGIN + 14, y - 16, "Storage / delivery location", location, 225)
    label_value(c, MARGIN + 274, y - 16, "Supplier batch / lot", batch, 225)
    return y - 88


def packet_info_box(c: canvas.Canvas, y: float, entries: list[tuple[str, str]]) -> float:
    c.setFillColor(PALE_GREEN)
    c.setStrokeColor(LINE)
    c.roundRect(MARGIN, y - 82, PAGE_W - 2 * MARGIN, 82, 8, fill=1, stroke=1)
    half = (PAGE_W - 2 * MARGIN - 28) / 2
    for index, (label, value) in enumerate(entries[:4]):
        row = index // 2
        col = index % 2
        label_value(c, MARGIN + 14 + col * (half + 14), y - 18 - row * 36, label, value, half - 8)
    return y - 102


def draw_purchase_order_page(c: canvas.Canvas, scenario: Scenario, sequence: int) -> None:
    packet_page_frame(c, scenario, 1, sequence)
    y = packet_party_cards(c, PAGE_H - 124)
    y = packet_metadata(c, y, [
        ("PO date", "20-08-2026"),
        ("Required by", "21-08-2026"),
        ("Payment terms", "30 days"),
        ("Freight", "Included"),
    ])
    y = packet_item_table(c, y)
    y = packet_inventory_references(c, scenario, y, "purchase order")
    packet_info_box(c, y, [
        ("Commercial classification", "Local purchase - CGST 9% plus SGST 9%"),
        ("Expected order value", money(TOTAL)),
        ("Delivery mode", "Road"),
        ("Inspection", "At buyer premises"),
    ])
    packet_page_footer(c, scenario, 1)
    c.showPage()


def draw_tax_invoice_page(c: canvas.Canvas, scenario: Scenario, sequence: int) -> None:
    packet_page_frame(c, scenario, 2, sequence)
    y = packet_party_cards(c, PAGE_H - 124)
    y = packet_metadata(c, y, [
        ("Invoice date", "21-08-2026"),
        ("Place of supply", "Maharashtra (27)"),
        ("Vehicle", "MH12FZ7225"),
        ("Reverse charge", "No"),
    ])
    y = packet_item_table(c, y)
    y = packet_inventory_references(c, scenario, y, "supplier invoice")
    packet_info_box(c, y, [
        ("Taxable value", money(TAXABLE)),
        ("Input CGST @ 9%", money(CGST)),
        ("Input SGST @ 9%", money(SGST)),
        ("Invoice total after round-off", money(TOTAL)),
    ])
    packet_page_footer(c, scenario, 2)
    c.showPage()


def draw_delivery_challan_page(c: canvas.Canvas, scenario: Scenario, sequence: int) -> None:
    packet_page_frame(c, scenario, 3, sequence)
    y = packet_party_cards(c, PAGE_H - 124)
    y = packet_metadata(c, y, [
        ("Challan date", "21-08-2026"),
        ("Invoice reference", scenario.invoice_number),
        ("PO reference", f"SNX/PO/26-27/{scenario.scenario_id}"),
        ("Vehicle", "MH12FZ7225"),
    ])
    y = packet_item_table(c, y, show_rate=False)
    y = packet_inventory_references(c, scenario, y, "delivery challan")
    packet_info_box(c, y, [
        ("Dispatch condition", "Loaded and sealed"),
        ("Receiver acknowledgement", "Pending at destination"),
        ("Transporter", "Nyx Road Carriers"),
        ("Mode", "Road"),
    ])
    packet_page_footer(c, scenario, 3)
    c.showPage()


def draw_weighment_page(c: canvas.Canvas, scenario: Scenario, sequence: int) -> None:
    packet_page_frame(c, scenario, 4, sequence)
    y = packet_metadata(c, PAGE_H - 132, [
        ("Weighbridge", "Solution Nyx test bridge"),
        ("Date and time", "21-08-2026 10:35"),
        ("Vehicle", "MH12FZ7225"),
    ])
    y = packet_metadata(c, y, [
        ("Supplier", SUPPLIER_NAME),
        ("Invoice reference", scenario.invoice_number),
        ("Material", ITEM_NAME),
    ])
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN, y, "Weight record")
    y -= 18
    widths = [230, 140, 146]
    c.setFillColor(PALE_GREEN)
    c.roundRect(MARGIN, y - 28, sum(widths), 28, 6, fill=1, stroke=0)
    x = MARGIN
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 7)
    for header, width in zip(("READING", "WEIGHT", "TIME"), widths):
        c.drawString(x + 8, y - 18, header)
        x += width
    y -= 28
    for record in (
        ("Gross weight", "28.660 MT", "10:12"),
        ("Tare weight", "16.000 MT", "10:35"),
        ("Net weight", "12.660 MT", "Calculated"),
    ):
        c.setFillColor(WHITE)
        c.setStrokeColor(LINE)
        c.rect(MARGIN, y - 42, sum(widths), 42, fill=1, stroke=1)
        x = MARGIN
        for value, width in zip(record, widths):
            c.setFillColor(INK)
            fit_text(c, value, x + 8, y - 26, width - 16, "Helvetica-Bold", 9)
            x += width
        y -= 42
    y -= 30
    y = packet_inventory_references(c, scenario, y, "weighment slip")
    packet_info_box(c, y, [
        ("Quantity comparison", "Net weight matches invoice quantity"),
        ("Matched quantity", "12.660 MT"),
        ("Weighbridge operator", "Synthetic test operator"),
        ("Status", "Matched"),
    ])
    packet_page_footer(c, scenario, 4)
    c.showPage()


def draw_eway_page(c: canvas.Canvas, scenario: Scenario, sequence: int) -> None:
    packet_page_frame(c, scenario, 5, sequence)
    y = packet_party_cards(c, PAGE_H - 124)
    y = packet_metadata(c, y, [
        ("Generated", "21-08-2026 09:50"),
        ("Valid until", "22-08-2026 23:59"),
        ("Document type", "Tax Invoice"),
        ("Document number", scenario.invoice_number),
    ])
    y = packet_item_table(c, y)
    y = packet_inventory_references(c, scenario, y, "e-way bill")
    destination = scenario.storage_location or "Buyer premises - location not stated"
    packet_info_box(c, y, [
        ("Transporter", "Nyx Road Carriers"),
        ("Vehicle", "MH12FZ7225"),
        ("Delivery destination", destination),
        ("Document value", money(TOTAL)),
    ])
    packet_page_footer(c, scenario, 5)
    c.showPage()


def draw_complete_packet(scenario: Scenario, sequence: int) -> None:
    path = OUTPUT / scenario.filename
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    c.setTitle(f"Synthetic purchase packet {scenario.invoice_number}")
    c.setAuthor("Kalika test tooling")
    draw_purchase_order_page(c, scenario, sequence)
    draw_tax_invoice_page(c, scenario, sequence)
    draw_delivery_challan_page(c, scenario, sequence)
    draw_weighment_page(c, scenario, sequence)
    draw_eway_page(c, scenario, sequence)
    c.save()


def write_runbook() -> None:
    rows = []
    for scenario in SCENARIOS:
        evidence = []
        if scenario.storage_location:
            evidence.append(f"Godown `{scenario.storage_location}`")
        if scenario.batch_number:
            evidence.append(f"batch `{scenario.batch_number}`")
        printed = ", ".join(evidence) if evidence else "No godown or batch stated"
        rows.append(
            f"| {scenario.scenario_id} | {scenario.expected} | `{scenario.filename}` | {printed} | {scenario.expected_result} |"
        )

    details = []
    for scenario in SCENARIOS:
        settings = "\n".join(f"- {item}" for item in scenario.tally_settings)
        masters = "\n".join(f"- {item}" for item in scenario.tally_masters)
        details.append(
            f"""## {scenario.scenario_id} - {scenario.expected}

PDF: `{scenario.filename}`  
Invoice number: `{scenario.invoice_number}`

Purpose: {scenario.rationale}

Tally settings before upload:

{settings}

Required live masters:

{masters}

Reviewer action: {scenario.reviewer_action}

Expected result: {scenario.expected_result}

After the case, delete only the test voucher. Restore changed features/master names before moving to the next scenario.
"""
        )

    content = f"""# Tally inventory-settings purchase test pack

This pack isolates godown and batch behavior while keeping the accounting data constant across every PDF.
Each scenario PDF is one complete five-page packet containing a Purchase Order, Tax Invoice,
Delivery Challan, Weighment Slip and E-Way Bill. Upload the complete PDF without splitting it.

## Fixed data in every PDF

- Tally company: `Solution Nyx`
- Supplier ledger: `{SUPPLIER_NAME}`
- Stock item: `{ITEM_NAME}`
- HSN: `{HSN}`
- Unit: `{UNIT}`
- Quantity: `{QUANTITY:.2f}`
- Rate: `{money(RATE)}`
- Taxable value: `{money(TAXABLE)}`
- GST: CGST 9% plus SGST 9%
- Invoice total after round-off: `{money(TOTAL)}`
- Optional toggles: keep 194Q TDS, Transport TDS, GST TDS and TCS Receivable off for all scenarios.

The invoice numbers and supporting-document references are unique so duplicate protection does not interfere with the inventory test.

## Packet pages

1. Purchase Order
2. Tax Invoice
3. Delivery Challan
4. Weighment Slip
5. E-Way Bill

The godown and batch evidence is repeated consistently on relevant pages. A BAD scenario is therefore bad because its evidence conflicts with live Tally, not because its packet is incomplete.

## Safety and test order

1. Take a Tally backup of `Solution Nyx`.
2. Run scenarios in this order: `G01`, `G02`, `B01`, `G03`, `G04`, `G05`, `B02`, `B03`, `B04`.
3. Upload only one PDF at a time.
4. Refresh live Tally masters after every feature or master change.
5. Confirm the selected Tally company is `Solution Nyx` before Save and check.
6. For GOOD cases, open the created Purchase voucher in Tally and verify stock item, quantity, godown, batch and amount.
7. For BAD cases, the ideal result is an app-level blocker before a posting command is queued. A generic Tally import exception counts as a defect in preflight validation.
8. Delete each successfully created test voucher before changing the item's inventory settings.
9. Restore the original company and stock-item settings when finished.

## Tally setup reference

Menu wording can vary slightly by TallyPrime release, but the accounting controls are the same.

### Enable or disable godowns

1. Open company `Solution Nyx`.
2. Open `F11 (Features)` and go to Inventory features.
3. Set `Maintain multiple godowns` to Yes or No as required by the scenario.
4. Save with `Ctrl+A`.

### Create the reversible test godowns

1. Use `Alt+G`, then `Create Master`, then `Godown`.
2. Create `Scrap Yard` under `Primary`.
3. For B01, create `Temporary Yard`, refresh the app once, and then alter that same godown to `Raw Material Store`.
4. Do not delete or rename the default `Main Location`.

### Enable or disable batches for the same stock item

1. In `F11 (Features)`, enable batches when required.
2. Use `Alt+G`, then `Alter Master`, then `Stock Item`.
3. Select `{ITEM_NAME}`.
4. Set `Maintain in batches` to Yes or No for the current scenario.
5. Keep manufacturing and expiry-date tracking off unless Tally requires them for the selected batch mode.
6. Save with `Ctrl+A`.

### Prepare the positive batch case

Use a controlled opening-balance or test inventory allocation to establish batch `TEST-BATCH-001` under `Scrap Yard` for `{ITEM_NAME}`. Do not introduce a second stock item. Confirm the batch/location combination is visible in Tally before uploading G05.

## Scenario matrix

| ID | Type | PDF | Printed inventory evidence | Expected |
| --- | --- | --- | --- | --- |
{chr(10).join(rows)}

## Important interpretation rules

- Printed invoice text is evidence, not proof that a Tally master exists.
- A godown or batch becomes postable only after it matches a live master in the selected company.
- The app must never silently replace an unknown printed godown with `Main Location`.
- When the invoice provides no location, the app may allow an explicit reviewer selection from live Tally.
- Godown and batch must be validated independently and, when both are used, in the correct hierarchy.
- Never hard-code `Main Location` or `Primary Batch` in the connector.

{chr(10).join(details)}
"""
    (OUTPUT / "TEST-RUNBOOK.md").write_text(content, encoding="utf-8")


def render_for_review() -> None:
    if not RENDERER.exists():
        raise FileNotFoundError(f"Poppler renderer not found: {RENDERER}")
    TMP.mkdir(parents=True, exist_ok=True)
    for scenario in SCENARIOS:
        prefix = TMP / Path(scenario.filename).stem
        subprocess.run(
            [str(RENDERER), "-png", "-r", "130", str(OUTPUT / scenario.filename), str(prefix)],
            check=True,
            capture_output=True,
        )


def main() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    if TMP.exists():
        shutil.rmtree(TMP)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for sequence, scenario in enumerate(SCENARIOS, start=1):
        draw_complete_packet(scenario, sequence)
    write_runbook()
    render_for_review()
    print(f"Created {len(SCENARIOS)} PDFs in {OUTPUT}")
    print(f"Rendered review images in {TMP}")


if __name__ == "__main__":
    main()
