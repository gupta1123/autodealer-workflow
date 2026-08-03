from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


OUTPUT = Path("output/pdf/solution-nyx-real-tally-master-purchase-test.pdf")
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 42

INK = colors.HexColor("#14231D")
MUTED = colors.HexColor("#5E6E67")
GREEN = colors.HexColor("#147D5A")
PALE_GREEN = colors.HexColor("#EAF7F1")
PALE_AMBER = colors.HexColor("#FFF7DF")
LINE = colors.HexColor("#DCE6E1")
WHITE = colors.white

COMPANY = "Solution Nyx"
SUPPLIER = "Vertex Industrial Supplies"
PURCHASE_LEDGER = "Solution Purchase Account"
CGST_LEDGER = "CD TEST - Output CGST"
SGST_LEDGER = "CD TEST - Output SGST"

INVOICE_NUMBER = "VIS/SNX/26-27/TEST-001"
INVOICE_DATE = "28/07/2026"
PO_NUMBER = "SNX/PO/2026/TEST-001"
PACKET_REFERENCE = "PKT-SNX-MSS-2026-0728-01"
BUYER_GSTIN = "27BBBBB0000B1Z5"
SUPPLIER_GSTIN = "27AAAAA0000A1Z5"
VEHICLE = "MH12AB1234"

BASIC = 250000.00
CGST = 22500.00
SGST = 22500.00
GROSS = BASIC + CGST + SGST
TDS = 2500.00
PAYABLE = GROSS - TDS


def money(value):
    return f"INR {value:,.2f}"


def fit_text(c, text, x, y, max_width, font="Helvetica", size=9):
    value = str(text)
    while value and stringWidth(value, font, size) > max_width:
        value = value[:-1]
    if value != str(text):
        value = value[:-3] + "..."
    c.setFont(font, size)
    c.drawString(x, y, value)


def page_frame(c, page_number, title, subtitle):
    c.setFillColor(PALE_GREEN)
    c.roundRect(MARGIN, PAGE_HEIGHT - 112, PAGE_WIDTH - 2 * MARGIN, 70, 12, fill=1, stroke=0)
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN + 18, PAGE_HEIGHT - 66, "KALIKA / TALLY PURCHASE WORKFLOW")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(MARGIN + 18, PAGE_HEIGHT - 92, title)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_WIDTH - MARGIN - 18, PAGE_HEIGHT - 66, subtitle)

    c.saveState()
    c.setFillColor(colors.Color(0.85, 0.15, 0.12, alpha=0.08))
    c.translate(PAGE_WIDTH / 2, PAGE_HEIGHT / 2)
    c.rotate(32)
    c.setFont("Helvetica-Bold", 44)
    c.drawCentredString(0, 0, "TEST ONLY - NOT A LEGAL DOCUMENT")
    c.restoreState()

    c.setStrokeColor(LINE)
    c.line(MARGIN, 40, PAGE_WIDTH - MARGIN, 40)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(
        MARGIN,
        26,
        "Real Tally master names are used. Amounts, GSTINs, references and logistics are synthetic test data.",
    )
    c.drawRightString(PAGE_WIDTH - MARGIN, 26, f"{PACKET_REFERENCE}  |  Page {page_number} of 5")


def info_grid(c, y, items, columns=3):
    width = PAGE_WIDTH - 2 * MARGIN
    gap = 8
    cell_width = (width - gap * (columns - 1)) / columns
    rows = (len(items) + columns - 1) // columns
    height = rows * 54
    for index, (label, value) in enumerate(items):
        row = index // columns
        col = index % columns
        x = MARGIN + col * (cell_width + gap)
        cell_y = y - row * 54
        c.setFillColor(colors.white)
        c.setStrokeColor(LINE)
        c.roundRect(x, cell_y - 44, cell_width, 44, 8, fill=1, stroke=1)
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawString(x + 10, cell_y - 14, label.upper())
        c.setFillColor(INK)
        fit_text(c, value, x + 10, cell_y - 31, cell_width - 20, "Helvetica-Bold", 9)
    return y - height


def section_title(c, y, number, title, detail=None):
    c.setFillColor(GREEN)
    c.circle(MARGIN + 8, y - 2, 8, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(MARGIN + 8, y - 5, str(number))
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN + 24, y - 6, title)
    if detail:
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7.5)
        c.drawRightString(PAGE_WIDTH - MARGIN, y - 6, detail)
    return y - 24


def draw_table(c, y, headers, rows, widths, row_height=28):
    x = MARGIN
    total_width = sum(widths)
    c.setFillColor(PALE_GREEN)
    c.roundRect(x, y - row_height, total_width, row_height, 6, fill=1, stroke=0)
    cursor = x
    for header, width in zip(headers, widths):
        c.setFillColor(GREEN)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(cursor + 6, y - 18, header.upper())
        cursor += width
    current_y = y - row_height
    for row in rows:
        c.setFillColor(WHITE)
        c.setStrokeColor(LINE)
        c.rect(x, current_y - row_height, total_width, row_height, fill=1, stroke=1)
        cursor = x
        for value, width in zip(row, widths):
            c.setFillColor(INK)
            fit_text(c, value, cursor + 6, current_y - 18, width - 12, "Helvetica", 8)
            cursor += width
        current_y -= row_height
    return current_y


def note_box(c, y, title, lines, tone="amber"):
    fill = PALE_AMBER if tone == "amber" else PALE_GREEN
    accent = colors.HexColor("#A76A00") if tone == "amber" else GREEN
    wrapped_lines = []
    max_width = PAGE_WIDTH - 2 * MARGIN - 28
    for source_line in lines:
        words = source_line.split()
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if stringWidth(candidate, "Helvetica", 7.5) <= max_width:
                current = candidate
            else:
                if current:
                    wrapped_lines.append(current)
                current = word
        if current:
            wrapped_lines.append(current)
    height = 30 + 14 * len(wrapped_lines)
    c.setFillColor(fill)
    c.setStrokeColor(accent)
    c.roundRect(MARGIN, y - height, PAGE_WIDTH - 2 * MARGIN, height, 10, fill=1, stroke=1)
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(MARGIN + 14, y - 18, title)
    c.setFillColor(INK)
    c.setFont("Helvetica", 7.5)
    for index, line in enumerate(wrapped_lines):
        c.drawString(MARGIN + 14, y - 34 - index * 14, line)
    return y - height


def page_purchase_order(c):
    page_frame(c, 1, "PURCHASE ORDER", "Synthetic transaction / real Tally master context")
    y = PAGE_HEIGHT - 134
    y = info_grid(c, y, [
        ("PO number", PO_NUMBER),
        ("PO date", INVOICE_DATE),
        ("Buyer / Tally company", COMPANY),
        ("Supplier ledger", SUPPLIER),
        ("Purchase ledger", PURCHASE_LEDGER),
        ("Delivery", "Chakan, Maharashtra"),
    ])
    y -= 18
    y = section_title(c, y, 1, "Ordered material")
    y = draw_table(
        c,
        y,
        ["Description", "HSN", "Qty", "Unit", "Rate", "Taxable"],
        [["Mild Steel Scrap - Heavy Melting Scrap", "72044900", "10.000", "MT", money(25000), money(BASIC)]],
        [190, 65, 48, 45, 78, 90],
    )
    y -= 22
    y = section_title(c, y, 2, "Commercial terms")
    y = info_grid(c, y, [
        ("GST", "18% (CGST 9% + SGST 9%)"),
        ("TDS", "1% on MS Scrap basic"),
        ("Payment", "Within 30 days"),
        ("Gross before TDS", money(GROSS)),
        ("TDS deduction", money(TDS)),
        ("Expected payable", money(PAYABLE)),
    ])
    y -= 18
    note_box(c, y, "Tally snapshot context", [
        f"Company: {COMPANY}",
        f"Creditor master: {SUPPLIER} | Purchase master: {PURCHASE_LEDGER}",
        "The current snapshot contains no stock items or units; the posting workflow should report that as a blocker.",
    ], "green")


def page_tax_invoice(c):
    page_frame(c, 2, "TAX INVOICE", "Primary posting source")
    y = PAGE_HEIGHT - 134
    y = info_grid(c, y, [
        ("Invoice number", INVOICE_NUMBER),
        ("Invoice date", INVOICE_DATE),
        ("PO reference", PO_NUMBER),
        ("Vehicle number", VEHICLE),
        ("Place of supply", "Maharashtra (27)"),
        ("Reverse charge", "No"),
    ])
    y -= 14
    y = section_title(c, y, 1, "Parties")
    y = info_grid(c, y, [
        ("Supplier / bill from", SUPPLIER),
        ("Supplier GSTIN", f"{SUPPLIER_GSTIN} (synthetic)"),
        ("Tally group", "Sundry Creditors"),
        ("Buyer / bill to", COMPANY),
        ("Buyer GSTIN", f"{BUYER_GSTIN} (synthetic)"),
        ("Tally purchase ledger", PURCHASE_LEDGER),
    ])
    y -= 14
    y = section_title(c, y, 2, "Invoice items")
    y = draw_table(
        c,
        y,
        ["Description", "HSN", "Qty", "Unit", "Rate", "Taxable"],
        [["Mild Steel Scrap - Heavy Melting Scrap", "72044900", "10.000", "MT", money(25000), money(BASIC)]],
        [190, 65, 48, 45, 78, 90],
    )
    y -= 14
    y = section_title(c, y, 3, "Accounting classification")
    y = draw_table(
        c,
        y,
        ["Component", "Basis / rate", "Amount"],
        [
            ["Basic / taxable amount", "10 MT x INR 25,000", money(BASIC)],
            ["CGST", "9%", money(CGST)],
            ["SGST", "9%", money(SGST)],
            ["Gross value before TDS", "", money(GROSS)],
            ["TDS on MS Scrap basic", "1%", f"-{money(TDS)}"],
            ["FINAL INVOICE TOTAL / PAYABLE", "", money(PAYABLE)],
        ],
        [235, 130, 151],
        row_height=24,
    )
    y -= 14
    note_box(c, y, "Source retention declaration", [
        "The controlled source document reference must be retained with any accounting entry created from this test packet.",
        f"Real Tally tax-master names observed: {CGST_LEDGER} / {SGST_LEDGER}. They are output ledgers and must not be accepted as purchase input ledgers.",
    ])


def page_delivery_challan(c):
    page_frame(c, 3, "DELIVERY CHALLAN", "Supporting logistics document")
    y = PAGE_HEIGHT - 134
    y = info_grid(c, y, [
        ("Delivery note", "VIS/DC/2026/TEST-001"),
        ("Date", INVOICE_DATE),
        ("PO reference", PO_NUMBER),
        ("Supplier", SUPPLIER),
        ("Consignee", COMPANY),
        ("Vehicle", VEHICLE),
    ])
    y -= 22
    y = section_title(c, y, 1, "Material dispatched")
    y = draw_table(
        c,
        y,
        ["Material", "HSN", "Quantity", "Unit", "Condition"],
        [["Mild Steel Scrap - Heavy Melting Scrap", "72044900", "10.000", "MT", "As inspected"]],
        [240, 75, 72, 58, 71],
    )
    y -= 24
    y = section_title(c, y, 2, "Dispatch controls")
    y = info_grid(c, y, [
        ("Store stamp", "Present"),
        ("Gate entry", "SNX/GE/TEST-001"),
        ("Transport mode", "Road"),
        ("Delivery location", "Chakan, Maharashtra"),
        ("Packet reference", PACKET_REFERENCE),
        ("Signature", "Authorized test signatory"),
    ])
    y -= 20
    note_box(c, y, "Cross-document checks", [
        "Invoice number is intentionally absent from the challan; matching should use PO, vehicle, supplier and material.",
        "Quantity, HSN and vehicle should agree with the invoice, weighment slip and e-way bill.",
    ], "green")


def page_weighment(c):
    page_frame(c, 4, "WEIGHMENT SLIP", "Supporting quantity evidence")
    y = PAGE_HEIGHT - 134
    y = info_grid(c, y, [
        ("Weighment number", "WB/SNX/TEST-0728-01"),
        ("Date / time", "28/07/2026 10:35"),
        ("Vehicle", VEHICLE),
        ("Supplier", SUPPLIER),
        ("Material", "MS Scrap"),
        ("Weighbridge", "Kalika Test Weighbridge"),
    ])
    y -= 22
    y = section_title(c, y, 1, "Weight record")
    y = draw_table(
        c,
        y,
        ["Reading", "Weight", "Recorded at"],
        [
            ["Gross weight", "28.500 MT", "10:12"],
            ["Tare weight", "18.500 MT", "10:35"],
            ["Net weight", "10.000 MT", "Calculated"],
        ],
        [210, 150, 156],
        row_height=34,
    )
    y -= 24
    note_box(c, y, "Quantity confirmation", [
        "Net weight is 10.000 MT and matches the invoice, purchase order and delivery challan.",
        "This page contains no accounting amount and should never override the invoice rate or payable.",
    ], "green")


def page_eway(c):
    page_frame(c, 5, "E-WAY BILL", "Supporting statutory movement document")
    y = PAGE_HEIGHT - 134
    y = info_grid(c, y, [
        ("E-way bill number", "2710TEST0728001"),
        ("Generated", "28/07/2026 09:45"),
        ("Valid until", "29/07/2026 23:59"),
        ("Invoice reference", INVOICE_NUMBER),
        ("Vehicle", VEHICLE),
        ("Transporter", "Kedar Transport Co"),
    ])
    y -= 16
    y = section_title(c, y, 1, "Movement parties")
    y = info_grid(c, y, [
        ("Dispatch from", SUPPLIER),
        ("Supplier GSTIN", f"{SUPPLIER_GSTIN} (synthetic)"),
        ("Ship to", COMPANY),
        ("Buyer GSTIN", f"{BUYER_GSTIN} (synthetic)"),
        ("From state", "Maharashtra (27)"),
        ("To state", "Maharashtra (27)"),
    ])
    y -= 16
    y = section_title(c, y, 2, "Consignment values")
    y = draw_table(
        c,
        y,
        ["Description", "HSN", "Taxable", "Tax", "Document value"],
        [["Mild Steel Scrap - Heavy Melting Scrap", "72044900", money(BASIC), money(CGST + SGST), money(GROSS)]],
        [218, 70, 84, 72, 72],
    )
    y -= 22
    note_box(c, y, "Expected packet behavior", [
        f"E-way bill document value is {money(GROSS)} before buyer-side TDS.",
        f"Tax invoice payable is {money(PAYABLE)} after 1% TDS. This is expected, not a mismatch.",
        "The packet should resolve to one canonical invoice and preserve all five source pages.",
    ], "green")


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("Solution Nyx - Real Tally Master Purchase Test Packet")
    c.setAuthor("Kalika test tooling")
    for draw_page in [
        page_purchase_order,
        page_tax_invoice,
        page_delivery_challan,
        page_weighment,
        page_eway,
    ]:
        draw_page(c)
        c.showPage()
    c.save()
    print(OUTPUT.resolve())


if __name__ == "__main__":
    main()
