from __future__ import annotations

import json
import math
from dataclasses import dataclass, replace
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


OUTPUT = Path("output/pdf/procurement-feature-library")
W, H = A4
M = 38
INK = colors.HexColor("#19231F")
MUTED = colors.HexColor("#66736D")
GREEN = colors.HexColor("#176B4D")
PALE = colors.HexColor("#EDF6F1")
LINE = colors.HexColor("#D7E0DB")
AMBER = colors.HexColor("#B66A16")
WHITE = colors.white

BUYER = "Solution Nyx"
BUYER_GSTIN = "27BBBBB0000B1Z5"
BUYER_ADDRESS = "MIDC Industrial Area, Pune, Maharashtra 411019"

SUPPLIERS = [
    ("A. H. Enterprises", "27AGHPC7911R1ZX", "Mumbai, Maharashtra"),
    ("Ankit Enterprises", "27AAEFA4821D1ZQ", "Navi Mumbai, Maharashtra"),
    ("Aura Laserfab Pvt. Ltd.", "27AAICA6284F1ZL", "Pune, Maharashtra"),
    ("Smelter AB Bros LLP", "27AELFS7316M1Z8", "Thane, Maharashtra"),
    ("Surya Steel Trading Company", "27AARFS8426N1ZC", "Jalna, Maharashtra"),
    ("Vertex Industrial Supplies", "27AAAAA0000A1Z5", "Aurangabad, Maharashtra"),
    ("Sahyadri Recycling Works", "27AAQFS3928E1ZV", "Nashik, Maharashtra"),
]

MATERIALS = [
    ("M S Scrap & Sponge Iron", "72044900", "MT", 33650.00),
    ("Sponge Iron Lumps", "72031000", "MTS", 28400.00),
    ("Heavy Melting Scrap", "72044900", "MT", 31250.00),
    ("CRC Punching Scrap", "72044100", "MTS", 34750.00),
    ("Cast Iron Borings", "72041000", "MT", 26800.00),
    ("MS Turning Scrap", "72044900", "MTS", 29500.00),
    ("Foundry Grade Pig Iron", "72011000", "MT", 39200.00),
]


@dataclass(frozen=True)
class Shipment:
    case_ref: str
    supplier: str
    supplier_gstin: str
    supplier_city: str
    po: str
    invoice: str
    eway: str
    lr: str
    weighment: str
    vehicle: str
    material: str
    hsn: str
    qty: float
    unit: str
    rate: float
    po_date: str
    invoice_date: str
    delivery_by: str
    buyer: str = BUYER
    buyer_gstin: str = BUYER_GSTIN
    buyer_address: str = BUYER_ADDRESS
    terms: tuple[str, ...] = (
        "Payment: 30 days from material receipt and acceptance.",
        "Delivery: Material shall reach Pune Stores by the agreed delivery date.",
        "Inspection: Quantity and quality are subject to buyer stores verification.",
        "Tax: GST shall be charged as applicable and shown separately on the invoice.",
    )

    @property
    def taxable(self) -> float:
        return round(self.qty * self.rate, 2)

    @property
    def cgst(self) -> float:
        return round(self.taxable * 0.09, 2)

    @property
    def total(self) -> float:
        return round(self.taxable + self.cgst * 2, 2)

    @property
    def qty_kg(self) -> float:
        return self.qty * 1000 if self.unit.upper() in {"MT", "MTS"} else self.qty


def money(value: float) -> str:
    return f"INR {value:,.2f}"


def quantity(value: float) -> str:
    return f"{value:,.3f}"


def fit(c: canvas.Canvas, text: object, x: float, y: float, width: float, font="Helvetica", size=8.2) -> None:
    value = str(text)
    while value and stringWidth(value, font, size) > width:
        value = value[:-1]
    if value != str(text) and len(value) > 4:
        value = value[:-3] + "..."
    c.setFont(font, size)
    c.drawString(x, y, value)


def wrap(c: canvas.Canvas, text: str, width: float, font="Helvetica", size=8.0) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if current and stringWidth(trial, font, size) > width:
            lines.append(current)
            current = word
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


def header(c: canvas.Canvas, issuer: str, title: str, reference: str, case_ref: str, page: int, pages: int) -> float:
    c.setFillColor(GREEN)
    c.roundRect(M, H - 106, W - 2 * M, 66, 9, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 16)
    fit(c, issuer, M + 15, H - 67, 280, "Helvetica-Bold", 16)
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(W - M - 15, H - 67, title)
    c.setFont("Helvetica", 7.5)
    c.drawRightString(W - M - 15, H - 84, reference)
    c.setStrokeColor(LINE)
    c.line(M, 38, W - M, 38)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(M, 24, f"Case reference: {case_ref}")
    c.drawRightString(W - M, 24, f"Page {page} of {pages}")
    return H - 126


def section(c: canvas.Canvas, y: float, label: str) -> float:
    c.setFillColor(PALE)
    c.roundRect(M, y - 24, W - 2 * M, 24, 5, fill=1, stroke=0)
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 8.2)
    c.drawString(M + 9, y - 16, label.upper())
    return y - 34


def fields(c: canvas.Canvas, y: float, values: list[tuple[str, str]], cols=3) -> float:
    gap = 7
    cell_w = (W - 2 * M - gap * (cols - 1)) / cols
    cell_h = 43
    for i, (label, value) in enumerate(values):
        row, col = divmod(i, cols)
        x = M + col * (cell_w + gap)
        top = y - row * cell_h
        c.setStrokeColor(LINE)
        c.setFillColor(WHITE)
        c.roundRect(x, top - cell_h + 5, cell_w, cell_h - 5, 5, fill=1, stroke=1)
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 6.2)
        c.drawString(x + 7, top - 12, label.upper())
        c.setFillColor(INK)
        fit(c, value, x + 7, top - 28, cell_w - 14, "Helvetica-Bold", 8)
    return y - math.ceil(len(values) / cols) * cell_h


def grid(c: canvas.Canvas, y: float, headers: list[str], rows: list[list[str]], widths: list[float], row_h=30) -> float:
    x = M
    c.setFillColor(PALE)
    c.rect(x, y - row_h, sum(widths), row_h, fill=1, stroke=0)
    cursor = x
    for label, width in zip(headers, widths):
        c.setFillColor(GREEN)
        fit(c, label.upper(), cursor + 5, y - 18, width - 10, "Helvetica-Bold", 6.4)
        cursor += width
    y -= row_h
    for row in rows:
        c.setFillColor(WHITE)
        c.setStrokeColor(LINE)
        c.rect(x, y - row_h, sum(widths), row_h, fill=1, stroke=1)
        cursor = x
        for value, width in zip(row, widths):
            c.setFillColor(INK)
            fit(c, value, cursor + 5, y - 18, width - 10, "Helvetica", 7.4)
            cursor += width
        y -= row_h
    return y


def notes(c: canvas.Canvas, y: float, values: tuple[str, ...] | list[str]) -> float:
    y = section(c, y, "Commercial terms and instructions")
    for i, value in enumerate(values, 1):
        lines = wrap(c, f"{i}. {value}", W - 2 * M - 18)
        c.setFillColor(INK)
        c.setFont("Helvetica", 7.8)
        for line in lines:
            c.drawString(M + 9, y, line)
            y -= 11
        y -= 3
    return y


def signature(c: canvas.Canvas, x: float, y: float, label: str, stamped=True) -> None:
    if stamped:
        c.setStrokeColor(GREEN)
        c.circle(x + 70, y + 17, 28, stroke=1, fill=0)
        c.setFillColor(GREEN)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString(x + 70, y + 19, "AUTHORISED")
        c.drawCentredString(x + 70, y + 10, "SIGNATORY")
    c.setStrokeColor(LINE)
    c.line(x, y, x + 140, y)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(x, y - 12, label)


def item_row(s: Shipment, qty: float | None = None, unit: str | None = None, hsn: str | None = None) -> list[str]:
    q = s.qty if qty is None else qty
    u = unit or s.unit
    taxable = round(q * s.rate, 2)
    return [s.material, hsn or s.hsn, quantity(q), u, money(s.rate), money(taxable)]


def purchase_order(c: canvas.Canvas, s: Shipment, page: int, pages: int, *, po: str | None = None, qty: float | None = None, hsn: str | None = None, terms_override: tuple[str, ...] | None = None) -> None:
    y = header(c, s.buyer, "PURCHASE ORDER", po or s.po, s.case_ref, page, pages)
    y = fields(c, y, [("PO number", po or s.po), ("Order date", s.po_date), ("Delivery by", s.delivery_by), ("Supplier", s.supplier), ("Supplier GSTIN", s.supplier_gstin), ("Ship to", "Pune Stores")])
    y -= 8
    y = section(c, y, "Material order")
    q = s.qty if qty is None else qty
    y = grid(c, y, ["Description", "HSN/SAC", "Qty", "Unit", "Rate", "Taxable"], [item_row(s, q, hsn=hsn)], [190, 66, 52, 44, 78, 86])
    taxable = round(q * s.rate, 2)
    tax = round(taxable * 0.18, 2)
    y -= 10
    y = fields(c, y, [("Taxable value", money(taxable)), ("CGST @ 9%", money(tax / 2)), ("SGST @ 9%", money(tax / 2)), ("Order value", money(taxable + tax))], cols=2)
    y -= 8
    y = notes(c, y, terms_override or s.terms)
    signature(c, W - M - 145, max(68, y - 35), f"For {s.buyer}")


def invoice(c: canvas.Canvas, s: Shipment, page: int, pages: int, *, invoice_no: str | None = None, po: str | None = None, qty: float | None = None, hsn: str | None = None, vehicle: str | None = None, supplier_gstin: str | None = None, total_delta: float = 0, buyer: str | None = None, buyer_gstin: str | None = None, issuer: str | None = None, copy_label: str | None = None) -> None:
    q = s.qty if qty is None else qty
    inv = invoice_no or s.invoice
    taxable = round(q * s.rate, 2)
    tax = round(taxable * 0.18, 2)
    total = taxable + tax + total_delta
    y = header(c, issuer or s.supplier, "TAX INVOICE", inv, s.case_ref, page, pages)
    if copy_label:
        c.setFillColor(AMBER)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(M, y + 8, copy_label.upper())
    y = fields(c, y, [("Invoice number", inv), ("Invoice date", s.invoice_date), ("Reference PO", po or s.po), ("Supplier GSTIN", supplier_gstin or s.supplier_gstin), ("Buyer", buyer or s.buyer), ("Buyer GSTIN", buyer_gstin or s.buyer_gstin), ("Vehicle", vehicle or s.vehicle), ("Place of supply", "Maharashtra (27)"), ("Currency", "INR")])
    y -= 8
    y = section(c, y, "Invoice particulars")
    y = grid(c, y, ["Description", "HSN/SAC", "Qty", "Unit", "Rate", "Taxable"], [item_row(s, q, hsn=hsn)], [190, 66, 52, 44, 78, 86])
    y -= 10
    y = grid(c, y, ["Particular", "Rate", "Amount"], [["Taxable value", "", money(taxable)], ["Input CGST", "9%", money(tax / 2)], ["Input SGST", "9%", money(tax / 2)], ["Invoice value", "", money(total)]], [276, 90, 160], row_h=24)
    signature(c, W - M - 145, max(72, y - 48), f"For {issuer or s.supplier}")


def eway(c: canvas.Canvas, s: Shipment, page: int, pages: int, *, invoice_no: str | None = None, qty: float | None = None, hsn: str | None = None, vehicle: str | None = None, supplier_gstin: str | None = None, total_delta: float = 0) -> None:
    q = s.qty if qty is None else qty
    taxable = round(q * s.rate, 2)
    tax = round(taxable * 0.18, 2)
    y = header(c, "Goods and Services Tax Network", "E-WAY BILL", s.eway, s.case_ref, page, pages)
    y = fields(c, y, [("E-Way Bill no.", s.eway), ("Generated on", f"{s.invoice_date} 10:35 AM"), ("Valid until", "05-10-2026 11:59 PM"), ("Document type", "Tax Invoice"), ("Document ref.", invoice_no or s.invoice), ("Vehicle", vehicle or s.vehicle)])
    y -= 8
    y = section(c, y, "Address details")
    y = fields(c, y, [("From", s.supplier), ("From GSTIN", supplier_gstin or s.supplier_gstin), ("Dispatch from", s.supplier_city), ("To", s.buyer), ("To GSTIN", s.buyer_gstin), ("Ship to", s.buyer_address)])
    y -= 8
    y = section(c, y, "Goods details")
    y = grid(c, y, ["Product", "HSN", "Quantity", "Unit", "Taxable", "Invoice value"], [[s.material, hsn or s.hsn, quantity(q), s.unit, money(taxable), money(taxable + tax + total_delta)]], [180, 60, 66, 48, 86, 86])
    y -= 12
    fields(c, y, [("Mode", "Road"), ("Transporter doc.", s.lr), ("Approx. distance", "155 km")])


def lorry(c: canvas.Canvas, s: Shipment, page: int, pages: int, *, invoice_no: str | None = None, vehicle: str | None = None, qty: float | None = None) -> None:
    q = s.qty if qty is None else qty
    y = header(c, "Kedar Transport Co.", "LORRY RECEIPT", s.lr, s.case_ref, page, pages)
    y = fields(c, y, [("LR number", s.lr), ("Receipt date", s.invoice_date), ("Invoice", invoice_no or s.invoice), ("Consignor", s.supplier), ("Consignee", s.buyer), ("Vehicle", vehicle or s.vehicle), ("Origin", s.supplier_city), ("Destination", "Pune, Maharashtra"), ("E-Way Bill", s.eway)])
    y -= 12
    y = section(c, y, "Goods carriage record")
    y = grid(c, y, ["Goods", "HSN", "Packages", "Unit", "Declared weight"], [[s.material, s.hsn, "Loose", s.unit, f"{quantity(q)} {s.unit}"]], [220, 72, 70, 58, 106], row_h=38)
    y -= 30
    signature(c, M, y, "Driver acknowledgement")
    signature(c, W - M - 145, y, "Carrier representative")


def weighment(c: canvas.Canvas, s: Shipment, page: int, pages: int, *, vehicle: str | None = None, qty: float | None = None) -> None:
    q = s.qty if qty is None else qty
    net = q * 1000 if s.unit.upper() in {"MT", "MTS"} else q
    tare = 14480
    gross = tare + net
    y = header(c, "Solution Nyx Weighbridge", "WEIGHMENT SLIP", s.weighment, s.case_ref, page, pages)
    y = fields(c, y, [("Weighment number", s.weighment), ("Date/time", f"{s.invoice_date} 08:42 AM"), ("Vehicle", vehicle or s.vehicle), ("Supplier", s.supplier), ("Material", s.material), ("Operator", "Stores - Shift A")])
    y -= 12
    y = section(c, y, "Weight summary")
    y = grid(c, y, ["Reading", "Weight", "Remarks"], [["Gross weight", f"{gross:,.0f} kg", "Loaded vehicle"], ["Tare weight", f"{tare:,.0f} kg", "Empty vehicle"], ["Net weight", f"{net:,.0f} kg", f"{quantity(net / 1000)} MTS"]], [220, 140, 166], row_h=39)
    y -= 42
    signature(c, M, y, "Weighbridge operator")
    signature(c, W - M - 145, y, "Stores acknowledgement")


def mtc(c: canvas.Canvas, s: Shipment, page: int, pages: int) -> None:
    y = header(c, "Independent Materials Laboratory", "MATERIAL TEST CERTIFICATE", f"MTC/{s.invoice[-4:]}", s.case_ref, page, pages)
    y = fields(c, y, [("Certificate number", f"MTC/{s.invoice[-4:]}/26"), ("Certificate date", s.invoice_date), ("Supplier", s.supplier), ("Material", s.material), ("Heat number", f"HT-{s.invoice[-3:]}") , ("Batch number", f"B-{s.invoice[-3:]}")])
    y -= 12
    y = section(c, y, "Chemical analysis")
    y = grid(c, y, ["Element", "C", "Mn", "Si", "S", "P"], [["Observed %", "0.19", "0.72", "0.24", "0.031", "0.028"]], [166, 72, 72, 72, 72, 72], row_h=38)
    y -= 16
    notes(c, y, ["Material conforms to the purchase specification and the submitted sample."])


def save_pdf(path: Path, pages: list[tuple], title: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    c.setTitle(title)
    c.setAuthor("Kalika Workflow Documents")
    total = len(pages)
    for index, (drawer, shipment, kwargs) in enumerate(pages, 1):
        drawer(c, shipment, index, total, **kwargs)
        c.showPage()
    c.save()


def base_shipment(index: int, prefix: str, *, supplier_index: int | None = None, qty: float | None = None) -> Shipment:
    supplier, gstin, city = SUPPLIERS[supplier_index if supplier_index is not None else (index - 1) % len(SUPPLIERS)]
    material, hsn, unit, rate = MATERIALS[(index - 1) % len(MATERIALS)]
    number = 5000 + index
    return Shipment(
        case_ref=f"SNX/26-27/{prefix}{index:02d}",
        supplier=supplier,
        supplier_gstin=gstin,
        supplier_city=city,
        po=f"SNX/PO/26-27/{number}",
        invoice=f"{prefix}/{index:02d}/26-27",
        eway=f"271946{number:06d}",
        lr=f"KTC/PUN/{6200 + index}",
        weighment=f"SNX/WB/{9300 + index}",
        vehicle=f"MH{12 + index:02d}AB{1200 + index}",
        material=material,
        hsn=hsn,
        qty=qty or float(16 + index),
        unit=unit,
        rate=rate,
        po_date=f"{20 + (index % 7):02d}-09-2026",
        invoice_date=f"{27 + (index % 3):02d}-09-2026",
        delivery_by="30-09-2026",
    )


def complete_pages(s: Shipment, *, po_kwargs=None, invoice_kwargs=None, eway_kwargs=None, lorry_kwargs=None, weighment_kwargs=None, extra=None) -> list[tuple]:
    pages = [
        (purchase_order, s, po_kwargs or {}),
        (invoice, s, invoice_kwargs or {}),
        (eway, s, eway_kwargs or {}),
        (lorry, s, lorry_kwargs or {}),
        (weighment, s, weighment_kwargs or {}),
    ]
    if extra:
        pages.extend(extra)
    return pages


def generate() -> list[dict]:
    records: list[dict] = []

    def add(category: str, index: int, name: str, pages: list[tuple], expectation: str, mismatches: list[str] | None = None) -> None:
        file_name = f"{index:02d}-{name}.pdf"
        path = OUTPUT / category / file_name
        save_pdf(path, pages, expectation)
        records.append({
            "category": category,
            "file": str(path.relative_to(OUTPUT)).replace("\\", "/"),
            "pageCount": len(pages),
            "expectedOutcome": expectation,
            "expectedMismatches": mismatches or [],
            "expectedMismatchCount": len(mismatches or []),
        })

    # Seven clean single-shipment packets.
    for i in range(1, 8):
        s = base_shipment(i, "GOOD")
        add("01-all-good", i, f"{s.supplier.lower().replace(' ', '-')}-clean-packet", complete_pages(s), "Complete packet with no mismatch expected")

    # Seven aggregate multi-invoice packets: one PO, two partial invoices whose totals equal the PO.
    for i in range(1, 8):
        whole = base_shipment(i, "MINV", qty=float(30 + i * 2))
        first = replace(whole, invoice=f"MINV/{i:02d}A/26-27", eway=f"281946{5100+i:06d}", lr=f"KTC/PUN/{7100+i}", weighment=f"SNX/WB/{10100+i}", qty=whole.qty * 0.4)
        second = replace(whole, invoice=f"MINV/{i:02d}B/26-27", eway=f"291946{5200+i:06d}", lr=f"KTC/PUN/{7200+i}", weighment=f"SNX/WB/{10200+i}", vehicle=f"MH{20+i:02d}CD{2200+i}", qty=whole.qty * 0.6)
        pages = [(purchase_order, whole, {})]
        pages += [(invoice, first, {}), (eway, first, {}), (lorry, first, {}), (weighment, first, {})]
        pages += [(invoice, second, {}), (eway, second, {}), (lorry, second, {}), (weighment, second, {})]
        add("02-multi-invoice", i, f"{whole.supplier.lower().replace(' ', '-')}-two-invoices-one-po", pages, "Two partial invoices aggregate exactly to one purchase order")

    # Seven seller-chain packets with an upstream mother bill and a Kalika-facing invoice.
    intermediaries = [
        ("Meridian Metal Link Pvt. Ltd.", "27AACCM6101F1ZP"),
        ("Bluecrest Steel Commerce LLP", "27AAEFB7822G1ZX"),
        ("Pioneer Ferrous Trading Co.", "27AAHFP4310L1ZS"),
        ("Western Alloy Distribution Pvt. Ltd.", "27AACCW5514B1ZT"),
        ("Deccan Material Exchange LLP", "27AAIFD8821C1ZQ"),
        ("Prime Industrial Metals", "27AAQFP6932J1ZR"),
        ("Trident Steel Resources Pvt. Ltd.", "27AAICT7246K1ZM"),
    ]
    for i in range(1, 8):
        downstream = base_shipment(i, "CHAIN")
        intermediary, intermediary_gstin = intermediaries[i - 1]
        downstream = replace(downstream, supplier=intermediary, supplier_gstin=intermediary_gstin)
        upstream_supplier, upstream_gstin, upstream_city = SUPPLIERS[(i + 2) % len(SUPPLIERS)]
        upstream = replace(
            downstream,
            case_ref=downstream.case_ref,
            supplier=upstream_supplier,
            supplier_gstin=upstream_gstin,
            supplier_city=upstream_city,
            buyer=intermediary,
            buyer_gstin=intermediary_gstin,
            buyer_address="Bhosari MIDC, Pune, Maharashtra 411026",
            po=f"{intermediary_gstin[:4]}/PO/26-27/{800+i}",
            invoice=f"MB/{i:02d}/26-27",
            eway=f"301946{5300+i:06d}",
            lr=f"MTR/UP/{8100+i}",
            weighment=f"UP/WB/{10300+i}",
        )
        pages = [
            (purchase_order, downstream, {}),
            (invoice, upstream, {"issuer": upstream.supplier}),
            (eway, upstream, {}),
            (lorry, upstream, {}),
            (invoice, downstream, {}),
            (eway, downstream, {}),
            (lorry, downstream, {}),
            (weighment, downstream, {}),
        ]
        add("03-mother-bill", i, f"{intermediary.lower().replace(' ', '-')}-seller-chain", pages, "Upstream mother bill retained as context; Kalika-facing invoice is primary")

    # Seven PDFs containing two independent complete packets for smart splitting.
    for i in range(1, 8):
        a = base_shipment(i, "MPA", supplier_index=(i - 1) % 7)
        b = base_shipment(i + 10, "MPB", supplier_index=i % 7)
        b = replace(b, case_ref=f"SNX/26-27/MPB{i:02d}")
        pages = complete_pages(a) + complete_pages(b)
        add("04-multi-packet", i, f"dispatch-bundle-{i:02d}-two-shipments", pages, "Smart Split should create two independent shipment cases")

    # Seven PO-terms compliance scenarios.
    terms_scenarios = [
        ("delivery-deadline-fulfilled", ("Delivery: Material must reach Pune Stores on or before 30-09-2026.", "Payment: 30 days after receipt.", "Inspection: Buyer weighment is final."), None, "All explicit PO obligations fulfilled"),
        ("delivery-deadline-breached", ("Delivery: Material must reach Pune Stores on or before 24-09-2026.", "Payment: 30 days after receipt."), None, "Delivery obligation not fulfilled"),
        ("mtc-required-present", ("Inspection: A material test certificate must accompany every consignment.", "Delivery: Material to Pune Stores by 30-09-2026."), "mtc", "Material-test-certificate obligation fulfilled"),
        ("mtc-required-missing", ("Inspection: A material test certificate must accompany every consignment.", "Delivery: Material to Pune Stores by 30-09-2026."), None, "Missing material-test-certificate obligation should require review"),
        ("buyer-weighment-required", ("Weighment: Buyer weighbridge net weight shall be final for billing.", "Tax: GST as applicable."), None, "Buyer-weighment obligation fulfilled"),
        ("payment-after-acceptance", ("Payment: 45 days after stores acceptance and invoice verification.", "Warranty: Material chemistry shall conform to the agreed grade."), "mtc", "Payment is future-dated; material evidence is fulfilled"),
        ("store-acknowledgement-required", ("Delivery: Lorry receipt and e-way bill must accompany the vehicle.", "Inspection: Stores acknowledgement is mandatory before acceptance."), None, "Transport and stores evidence obligations fulfilled"),
    ]
    for i, (slug, term_set, extra_kind, expectation) in enumerate(terms_scenarios, 1):
        s = replace(base_shipment(i, "TERM"), terms=term_set)
        if slug == "delivery-deadline-breached":
            s = replace(s, delivery_by="24-09-2026", invoice_date="29-09-2026")
        extra = [(mtc, s, {})] if extra_kind == "mtc" else None
        add("05-po-terms-compliance", i, slug, complete_pages(s, po_kwargs={"terms_override": term_set}, extra=extra), expectation)

    # Seven mismatch packets, each with exactly three or four deliberate discrepancies.
    mismatch_specs = [
        ("po-vehicle-quantity", ["PO reference: invoice 6100 vs order 6101", "Vehicle number: lorry MH19AB9001 vs invoice MH19AB1201", "Quantity: E-Way Bill 18 MT vs order 17 MT"]),
        ("gstin-hsn-total-weight", ["Supplier GSTIN differs on E-Way Bill", "HSN/SAC differs on invoice", "Invoice total is INR 2,500 higher", "Net weight is 750 kg lower"]),
        ("invoice-ref-vehicle-hsn", ["E-Way Bill references another invoice", "Weighment vehicle differs", "E-Way Bill HSN/SAC differs"]),
        ("po-quantity-total-gstin", ["Invoice PO reference differs", "Invoice quantity is 2 MT higher", "E-Way Bill total is INR 4,000 higher", "Invoice supplier GSTIN differs"]),
        ("vehicle-weight-hsn", ["Lorry vehicle differs", "Weighment net weight is 1,200 kg lower", "Invoice HSN/SAC differs"]),
        ("invoice-ref-po-total-quantity", ["E-Way Bill invoice reference differs", "Invoice PO reference differs", "Invoice total is INR 3,750 higher", "Lorry declared quantity is 1 MT lower"]),
        ("gstin-vehicle-quantity-weight", ["E-Way Bill supplier GSTIN differs", "E-Way Bill vehicle differs", "Invoice quantity is 1.5 MT higher", "Weighment net weight is 900 kg lower"]),
    ]
    for i, (slug, expected) in enumerate(mismatch_specs, 1):
        s = base_shipment(i, "MIS")
        po_kw: dict = {}
        inv_kw: dict = {}
        ew_kw: dict = {}
        lr_kw: dict = {}
        wb_kw: dict = {}
        if i == 1:
            inv_kw["po"] = s.po[:-1] + "0"; ew_kw["qty"] = s.qty + 1; lr_kw["vehicle"] = "MH19AB9001"
        elif i == 2:
            ew_kw["supplier_gstin"] = "27AACCS7788P1Z4"; inv_kw.update({"hsn": "72031000", "total_delta": 2500}); wb_kw["qty"] = s.qty - 0.75
        elif i == 3:
            ew_kw.update({"invoice_no": f"OTHER/{i:02d}/26-27", "hsn": "72041000"}); wb_kw["vehicle"] = "MH22ZX7788"
        elif i == 4:
            inv_kw.update({"po": s.po[:-1] + "8", "qty": s.qty + 2, "supplier_gstin": "27AAQPS5544R1ZT"}); ew_kw["total_delta"] = 4000
        elif i == 5:
            lr_kw["vehicle"] = "MH25YY4411"; wb_kw["qty"] = s.qty - 1.2; inv_kw["hsn"] = "72031000"
        elif i == 6:
            ew_kw["invoice_no"] = f"ALT/{i:02d}/26-27"; inv_kw.update({"po": s.po[:-1] + "3", "total_delta": 3750}); lr_kw["qty"] = s.qty - 1
        elif i == 7:
            ew_kw.update({"supplier_gstin": "27AABCT8899M1Z6", "vehicle": "MH28ZZ6633"}); inv_kw["qty"] = s.qty + 1.5; wb_kw["qty"] = s.qty - 0.9
        add("06-mismatch-cases", i, slug, complete_pages(s, po_kwargs=po_kw, invoice_kwargs=inv_kw, eway_kwargs=ew_kw, lorry_kwargs=lr_kw, weighment_kwargs=wb_kw), f"Review required with {len(expected)} deliberate mismatches", expected)

    return records


def write_register(records: list[dict]) -> None:
    by_category: dict[str, list[dict]] = {}
    for record in records:
        by_category.setdefault(record["category"], []).append(record)
    lines = [
        "# Procurement Feature Validation Library",
        "",
        "This library contains 42 presentation-ready procurement packets for validating the complete case workflow.",
        "The PDFs use Solution Nyx as the buyer and realistic supplier, logistics, tax, quantity, and weight records.",
        "",
        "For multi-packet files, select Smart Split during analysis.",
        "For mother-bill files, select the invoice billed to Solution Nyx when preparing the Tally voucher.",
        "",
    ]
    for category, entries in by_category.items():
        lines.extend([f"## {category}", "", "| PDF | Pages | Expected result | Mismatches |", "|---|---:|---|---|"])
        for entry in entries:
            mismatch_text = "; ".join(entry["expectedMismatches"]) or "None"
            lines.append(f"| `{entry['file'].split('/')[-1]}` | {entry['pageCount']} | {entry['expectedOutcome']} | {mismatch_text} |")
        lines.append("")
    (OUTPUT / "CASE_REGISTER.md").write_text("\n".join(lines), encoding="utf-8")
    (OUTPUT / "manifest.json").write_text(json.dumps({"totalPdfs": len(records), "cases": records}, indent=2), encoding="utf-8")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = generate()
    write_register(records)
    print(f"Generated {len(records)} PDFs in {OUTPUT.resolve()}")


if __name__ == "__main__":
    main()
