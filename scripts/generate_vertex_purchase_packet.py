from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


OUTPUT = Path("output/pdf/vertex-industrial-supplies-purchase-packet.pdf")
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 38

INK = colors.HexColor("#18221E")
MUTED = colors.HexColor("#64716B")
ACCENT = colors.HexColor("#1C6B4F")
PALE = colors.HexColor("#EEF6F2")
LINE = colors.HexColor("#D7E0DB")
WHITE = colors.white

SUPPLIER = "Vertex Industrial Supplies"
BUYER = "Solution Nyx"
SUPPLIER_GSTIN = "27AAAAA0000A1Z5"
BUYER_GSTIN = "27BBBBB0000B1Z5"
INVOICE_NUMBER = "VIS/26-27/0142"
INVOICE_DATE = "28/07/2026"
PO_NUMBER = "SNX/PO/26-27/0098"
CHALLAN_NUMBER = "VIS/DC/26-27/0116"
VEHICLE_NUMBER = "MH12AB1234"

BASIC = 250000.00
CGST = 22500.00
SGST = 22500.00
GROSS = 295000.00
TDS = 2500.00
PAYABLE = 292500.00


def money(value):
    return f"INR {value:,.2f}"


def fit_text(pdf, value, x, y, max_width, font="Helvetica", size=8.5):
    text = str(value)
    original = text
    while text and stringWidth(text, font, size) > max_width:
        text = text[:-1]
    if text != original and len(text) > 3:
        text = text[:-3] + "..."
    pdf.setFont(font, size)
    pdf.drawString(x, y, text)


def footer(pdf, page_number):
    pdf.setStrokeColor(LINE)
    pdf.line(MARGIN, 38, PAGE_WIDTH - MARGIN, 38)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7)
    pdf.drawString(MARGIN, 24, f"Document reference: {INVOICE_NUMBER}")
    pdf.drawRightString(PAGE_WIDTH - MARGIN, 24, f"Page {page_number} of 5")


def document_header(pdf, issuer, title, reference, page_number, subtitle=None):
    pdf.setFillColor(ACCENT)
    pdf.roundRect(MARGIN, PAGE_HEIGHT - 108, PAGE_WIDTH - 2 * MARGIN, 68, 10, fill=1, stroke=0)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(MARGIN + 16, PAGE_HEIGHT - 68, issuer)
    pdf.setFont("Helvetica", 8)
    if subtitle:
        pdf.drawString(MARGIN + 16, PAGE_HEIGHT - 84, subtitle)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawRightString(PAGE_WIDTH - MARGIN - 16, PAGE_HEIGHT - 68, title)
    pdf.setFont("Helvetica", 8)
    pdf.drawRightString(PAGE_WIDTH - MARGIN - 16, PAGE_HEIGHT - 84, reference)
    footer(pdf, page_number)


def section(pdf, y, title):
    pdf.setFillColor(PALE)
    pdf.roundRect(MARGIN, y - 26, PAGE_WIDTH - 2 * MARGIN, 26, 6, fill=1, stroke=0)
    pdf.setFillColor(ACCENT)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(MARGIN + 10, y - 17, title.upper())
    return y - 36


def fields(pdf, y, values, columns=3, height=47):
    width = PAGE_WIDTH - 2 * MARGIN
    gap = 7
    cell_width = (width - gap * (columns - 1)) / columns
    rows = (len(values) + columns - 1) // columns
    for index, (label, value) in enumerate(values):
        row, column = divmod(index, columns)
        x = MARGIN + column * (cell_width + gap)
        top = y - row * height
        pdf.setStrokeColor(LINE)
        pdf.setFillColor(WHITE)
        pdf.roundRect(x, top - height + 5, cell_width, height - 5, 6, fill=1, stroke=1)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 6.5)
        pdf.drawString(x + 8, top - 13, label.upper())
        pdf.setFillColor(INK)
        fit_text(pdf, value, x + 8, top - 30, cell_width - 16, "Helvetica-Bold", 8.5)
    return y - rows * height


def table(pdf, y, headers, rows, widths, row_height=29):
    x = MARGIN
    pdf.setFillColor(PALE)
    pdf.roundRect(x, y - row_height, sum(widths), row_height, 5, fill=1, stroke=0)
    cursor = x
    for heading, width in zip(headers, widths):
        pdf.setFillColor(ACCENT)
        pdf.setFont("Helvetica-Bold", 6.8)
        pdf.drawString(cursor + 6, y - 18, heading.upper())
        cursor += width
    y -= row_height
    for row in rows:
        pdf.setStrokeColor(LINE)
        pdf.setFillColor(WHITE)
        pdf.rect(x, y - row_height, sum(widths), row_height, fill=1, stroke=1)
        cursor = x
        for value, width in zip(row, widths):
            pdf.setFillColor(INK)
            fit_text(pdf, value, cursor + 6, y - 18, width - 12, "Helvetica", 8)
            cursor += width
        y -= row_height
    return y


def signature_line(pdf, x, y, label):
    pdf.setStrokeColor(LINE)
    pdf.line(x, y, x + 150, y)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7)
    pdf.drawString(x, y - 13, label)


def purchase_order(pdf):
    document_header(
        pdf,
        BUYER,
        "PURCHASE ORDER",
        PO_NUMBER,
        1,
        "Procurement Department",
    )
    y = PAGE_HEIGHT - 128
    y = fields(pdf, y, [
        ("PO date", INVOICE_DATE),
        ("Supplier", SUPPLIER),
        ("Delivery location", "Chakan, Maharashtra"),
        ("Contact", "Purchase Department"),
        ("Payment terms", "30 days"),
        ("Transport", "By road"),
    ])
    y -= 12
    y = section(pdf, y, "Material order")
    y = table(
        pdf,
        y,
        ["Description", "HSN", "Qty", "Unit", "Rate", "Amount"],
        [["Mild Steel Scrap - HMS", "72044900", "10.000", "MT", money(25000), money(BASIC)]],
        [188, 66, 52, 45, 79, 86],
    )
    y -= 18
    y = section(pdf, y, "Commercial terms")
    y = fields(pdf, y, [
        ("Tax", "CGST 9% + SGST 9%"),
        ("Basic value", money(BASIC)),
        ("Order value", money(GROSS)),
        ("Quality", "As per agreed specification"),
        ("Weighment", "At buyer weighbridge"),
        ("Delivery", "Within 3 working days"),
    ])
    y -= 28
    signature_line(pdf, MARGIN, y, "Prepared by")
    signature_line(pdf, PAGE_WIDTH - MARGIN - 150, y, "Authorised signatory")


def tax_invoice(pdf):
    document_header(
        pdf,
        SUPPLIER,
        "TAX INVOICE",
        INVOICE_NUMBER,
        2,
        "Industrial Supplies and Ferrous Materials",
    )
    y = PAGE_HEIGHT - 128
    y = fields(pdf, y, [
        ("Invoice date", INVOICE_DATE),
        ("PO reference", PO_NUMBER),
        ("Vehicle number", VEHICLE_NUMBER),
        ("Supplier GSTIN", SUPPLIER_GSTIN),
        ("Place of supply", "Maharashtra (27)"),
        ("Reverse charge", "No"),
    ])
    y -= 12
    y = section(pdf, y, "Bill to")
    y = fields(pdf, y, [
        ("Customer", BUYER),
        ("GSTIN", BUYER_GSTIN),
        ("State", "Maharashtra"),
    ])
    y -= 10
    y = section(pdf, y, "Invoice particulars")
    y = table(
        pdf,
        y,
        ["Description", "HSN", "Qty", "Unit", "Rate", "Taxable"],
        [["Mild Steel Scrap - HMS", "72044900", "10.000", "MT", money(25000), money(BASIC)]],
        [188, 66, 52, 45, 79, 86],
    )
    y -= 12
    y = table(
        pdf,
        y,
        ["Particular", "Rate", "Amount"],
        [
            ["Taxable value", "", money(BASIC)],
            ["CGST", "9%", money(CGST)],
            ["SGST", "9%", money(SGST)],
            ["Invoice value", "", money(GROSS)],
            ["TDS on scrap", "1%", f"- {money(TDS)}"],
            ["Net amount payable", "", money(PAYABLE)],
        ],
        [276, 90, 150],
        row_height=23,
    )
    y -= 20
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(MARGIN, y, "Amount in words:")
    pdf.setFont("Helvetica", 8)
    pdf.drawString(MARGIN + 82, y, "Indian Rupees Two Lakh Ninety-Two Thousand Five Hundred Only")
    y -= 42
    signature_line(pdf, PAGE_WIDTH - MARGIN - 150, y, f"For {SUPPLIER}")


def delivery_challan(pdf):
    document_header(
        pdf,
        SUPPLIER,
        "DELIVERY CHALLAN",
        CHALLAN_NUMBER,
        3,
        "Dispatch Department",
    )
    y = PAGE_HEIGHT - 128
    y = fields(pdf, y, [
        ("Date", INVOICE_DATE),
        ("Invoice reference", INVOICE_NUMBER),
        ("PO reference", PO_NUMBER),
        ("Consignee", BUYER),
        ("Vehicle", VEHICLE_NUMBER),
        ("Destination", "Chakan, Maharashtra"),
    ])
    y -= 18
    y = section(pdf, y, "Goods dispatched")
    y = table(
        pdf,
        y,
        ["Material", "HSN", "Quantity", "Unit", "Packages"],
        [["Mild Steel Scrap - HMS", "72044900", "10.000", "MT", "Loose load"]],
        [236, 80, 75, 58, 67],
    )
    y -= 26
    y = fields(pdf, y, [
        ("Transport mode", "Road"),
        ("Loading point", "Pune, Maharashtra"),
        ("Freight", "Paid"),
    ])
    y -= 42
    signature_line(pdf, MARGIN, y, "Receiver's signature")
    signature_line(pdf, PAGE_WIDTH - MARGIN - 150, y, "Dispatch authorised by")


def weighment_slip(pdf):
    document_header(
        pdf,
        "Chakan Industrial Weighbridge",
        "WEIGHMENT SLIP",
        "CIW/260728/184",
        4,
        "Chakan MIDC, Pune, Maharashtra",
    )
    y = PAGE_HEIGHT - 128
    y = fields(pdf, y, [
        ("Date", INVOICE_DATE),
        ("Vehicle", VEHICLE_NUMBER),
        ("Party", SUPPLIER),
        ("Material", "Mild Steel Scrap"),
        ("In time", "10:12"),
        ("Out time", "10:35"),
    ])
    y -= 18
    y = section(pdf, y, "Weight record")
    y = table(
        pdf,
        y,
        ["Reading", "Weight", "Time"],
        [
            ["Gross weight", "28.500 MT", "10:12"],
            ["Tare weight", "18.500 MT", "10:35"],
            ["Net weight", "10.000 MT", "10:35"],
        ],
        [246, 150, 120],
        row_height=38,
    )
    y -= 58
    signature_line(pdf, MARGIN, y, "Vehicle driver")
    signature_line(pdf, PAGE_WIDTH - MARGIN - 150, y, "Weighbridge operator")


def eway_bill(pdf):
    document_header(
        pdf,
        "E-Way Bill",
        "FORM GST EWB-01",
        "2710260728184",
        5,
        "Goods and Services Tax",
    )
    y = PAGE_HEIGHT - 128
    y = fields(pdf, y, [
        ("Generated date", "28/07/2026 09:45"),
        ("Valid until", "29/07/2026 23:59"),
        ("Document type", "Tax Invoice"),
        ("Document number", INVOICE_NUMBER),
        ("Document date", INVOICE_DATE),
        ("Transaction type", "Regular"),
    ])
    y -= 12
    y = section(pdf, y, "Parties")
    y = fields(pdf, y, [
        ("From", SUPPLIER),
        ("From GSTIN", SUPPLIER_GSTIN),
        ("From state", "Maharashtra"),
        ("To", BUYER),
        ("To GSTIN", BUYER_GSTIN),
        ("To state", "Maharashtra"),
    ])
    y -= 12
    y = section(pdf, y, "Goods details")
    y = table(
        pdf,
        y,
        ["Product", "HSN", "Qty", "Taxable", "Tax", "Value"],
        [[
            "Mild Steel Scrap - HMS",
            "72044900",
            "10.000 MT",
            f"{BASIC:,.2f}",
            f"{CGST + SGST:,.2f}",
            f"{GROSS:,.2f}",
        ]],
        [158, 65, 68, 83, 70, 72],
    )
    y -= 18
    y = section(pdf, y, "Transport details")
    fields(pdf, y, [
        ("Mode", "Road"),
        ("Vehicle", VEHICLE_NUMBER),
        ("Distance", "42 km"),
    ])


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    pdf.setTitle(f"{SUPPLIER} - Purchase Packet")
    pdf.setAuthor(SUPPLIER)
    for draw_page in [purchase_order, tax_invoice, delivery_challan, weighment_slip, eway_bill]:
        draw_page(pdf)
        pdf.showPage()
    pdf.save()
    print(OUTPUT.resolve())


if __name__ == "__main__":
    main()
