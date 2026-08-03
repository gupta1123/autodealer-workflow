from __future__ import annotations

import json
import hashlib
import math
import shutil
import subprocess
from dataclasses import asdict, dataclass, field, replace
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "purchase-voucher-stress-pack"
TMP = ROOT / "tmp" / "pdfs" / "purchase-voucher-stress-pack"
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
BUYER = {
    "name": "Solution Nyx",
    "gstin": "27BBBBB0000B1Z5",
    "state": "Maharashtra",
    "state_code": "27",
    "address": "Unit 14, Meridian Industrial Estate, Taloja MIDC, Navi Mumbai - 410208",
}

BLUE = colors.HexColor("#154C79")
GREEN = colors.HexColor("#166534")
ORANGE = colors.HexColor("#B45309")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#667085")
GRID = colors.HexColor("#D7DEE8")
PALE = colors.HexColor("#F5F7FA")


@dataclass
class Supplier:
    name: str
    gstin: str
    state: str
    state_code: str
    address: str
    phone: str
    email: str


@dataclass
class Item:
    description: str
    hsn: str
    quantity: Decimal
    unit: str
    rate: Decimal
    taxable: Decimal | None = None

    @property
    def calculated_taxable(self) -> Decimal:
        return money(self.quantity * self.rate)

    @property
    def printed_taxable(self) -> Decimal:
        return money(self.taxable if self.taxable is not None else self.calculated_taxable)


@dataclass
class Invoice:
    filename: str
    scenario_id: str
    supplier: Supplier
    number: str
    invoice_date: str
    vehicle: str
    items: list[Item]
    layout: str = "classic"
    cgst_rate: Decimal = Decimal("9")
    sgst_rate: Decimal = Decimal("9")
    igst_rate: Decimal = Decimal("18")
    tax_mode: str | None = None
    freight_amount: Decimal = Decimal("0")
    freight_gst_rate: Decimal = Decimal("18")
    tds_rate: Decimal = Decimal("0.1")
    tds_amount: Decimal | None = None
    transport_tds_rate: Decimal = Decimal("1")
    transport_tds_amount: Decimal | None = None
    gst_tds_rate: Decimal | None = None
    cgst_tds_amount: Decimal | None = None
    sgst_tds_amount: Decimal | None = None
    igst_tds_amount: Decimal | None = None
    tcs_amount: Decimal = Decimal("0")
    round_off: Decimal = Decimal("0")
    printed_cgst: Decimal | None = None
    printed_sgst: Decimal | None = None
    printed_igst: Decimal | None = None
    printed_total: Decimal | None = None
    buyer_override: dict[str, str] | None = None
    tax_text_only: bool = False
    page_lines: int = 13
    notes: list[str] = field(default_factory=list)
    expected: str = "postable_after_review"
    expected_blockers: list[str] = field(default_factory=list)
    create_supplier_in_tally: bool = True
    transform: str | None = None

    @property
    def buyer(self) -> dict[str, str]:
        return self.buyer_override or BUYER

    @property
    def mode(self) -> str:
        if self.tax_mode:
            return self.tax_mode
        return "local" if self.supplier.state_code == self.buyer["state_code"] else "interstate"

    @property
    def taxable(self) -> Decimal:
        return money(sum((line.printed_taxable for line in self.items), Decimal("0")))

    @property
    def gst_taxable(self) -> Decimal:
        taxable_freight = self.freight_amount if self.freight_gst_rate > 0 else Decimal("0")
        return money(self.taxable + taxable_freight)

    @property
    def scrap_taxable(self) -> Decimal:
        return money(
            sum(
                (
                    line.printed_taxable
                    for line in self.items
                    if line.hsn.replace(" ", "").startswith("7204")
                ),
                Decimal("0"),
            )
        )

    @property
    def calculated_cgst(self) -> Decimal:
        if self.mode != "local":
            return Decimal("0")
        return money(self.gst_taxable * self.cgst_rate / Decimal("100"))

    @property
    def calculated_sgst(self) -> Decimal:
        if self.mode != "local":
            return Decimal("0")
        return money(self.gst_taxable * self.sgst_rate / Decimal("100"))

    @property
    def calculated_igst(self) -> Decimal:
        if self.mode != "interstate":
            return Decimal("0")
        return money(self.gst_taxable * self.igst_rate / Decimal("100"))

    @property
    def cgst(self) -> Decimal:
        return money(self.printed_cgst if self.printed_cgst is not None else self.calculated_cgst)

    @property
    def sgst(self) -> Decimal:
        return money(self.printed_sgst if self.printed_sgst is not None else self.calculated_sgst)

    @property
    def igst(self) -> Decimal:
        return money(self.printed_igst if self.printed_igst is not None else self.calculated_igst)

    @property
    def tds(self) -> Decimal:
        if self.tds_amount is not None:
            return money(self.tds_amount)
        return money(self.scrap_taxable * self.tds_rate / Decimal("100"))

    @property
    def transport_tds(self) -> Decimal:
        if self.transport_tds_amount is not None:
            return money(self.transport_tds_amount)
        return money(self.freight_amount * self.transport_tds_rate / Decimal("100"))

    @property
    def effective_gst_tds_rate(self) -> Decimal:
        if self.gst_tds_rate is not None:
            return self.gst_tds_rate
        return Decimal("1") if self.mode == "local" else Decimal("2")

    @property
    def cgst_tds(self) -> Decimal:
        if self.cgst_tds_amount is not None:
            return money(self.cgst_tds_amount)
        if self.mode != "local":
            return Decimal("0")
        return money(self.scrap_taxable * self.effective_gst_tds_rate / Decimal("100"))

    @property
    def sgst_tds(self) -> Decimal:
        if self.sgst_tds_amount is not None:
            return money(self.sgst_tds_amount)
        if self.mode != "local":
            return Decimal("0")
        return money(self.scrap_taxable * self.effective_gst_tds_rate / Decimal("100"))

    @property
    def igst_tds(self) -> Decimal:
        if self.igst_tds_amount is not None:
            return money(self.igst_tds_amount)
        if self.mode != "interstate":
            return Decimal("0")
        return money(self.scrap_taxable * self.effective_gst_tds_rate / Decimal("100"))

    @property
    def total_withholding(self) -> Decimal:
        return money(self.tds + self.transport_tds + self.cgst_tds + self.sgst_tds + self.igst_tds)

    @property
    def calculated_total(self) -> Decimal:
        return money(
            self.taxable
            + self.freight_amount
            + self.cgst
            + self.sgst
            + self.igst
            - self.total_withholding
            + self.tcs_amount
            + self.round_off
        )

    @property
    def total(self) -> Decimal:
        return money(self.printed_total if self.printed_total is not None else self.calculated_total)


def money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def gstin_checksum(first_fourteen: str) -> str:
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    factor = 2
    total = 0
    for character in reversed(first_fourteen.upper()):
        product = factor * alphabet.index(character)
        total += (product // 36) + (product % 36)
        factor = 2 if factor == 1 else 1
    return alphabet[(36 - (total % 36)) % 36]


def make_gstin(state_code: str, pan: str, entity: str = "1") -> str:
    first_fourteen = f"{state_code}{pan}{entity}Z"
    if len(first_fourteen) != 14:
        raise ValueError(first_fourteen)
    return first_fourteen + gstin_checksum(first_fourteen)


def indian(value: Decimal, places: int = 2) -> str:
    negative = value < 0
    value = abs(value)
    fixed = f"{value:.{places}f}"
    whole, fraction = fixed.split(".")
    if len(whole) > 3:
        tail = whole[-3:]
        head = whole[:-3]
        groups: list[str] = []
        while head:
            groups.insert(0, head[-2:])
            head = head[:-2]
        whole = ",".join(groups + [tail])
    result = f"{whole}.{fraction}"
    return f"-{result}" if negative else result


def amount_words(value: Decimal) -> str:
    ones = [
        "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen",
    ]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def under_hundred(number: int) -> str:
        if number < 20:
            return ones[number]
        parts = [tens[number // 10]]
        if number % 10:
            parts.append(ones[number % 10])
        return " ".join(parts)

    def under_thousand(number: int) -> str:
        if number < 100:
            return under_hundred(number)
        remainder = number % 100
        return f"{ones[number // 100]} Hundred" + (f" {under_hundred(remainder)}" if remainder else "")

    rupees = int(abs(value))
    remainder = rupees
    parts: list[str] = []
    for divisor, label in ((10_000_000, "Crore"), (100_000, "Lakh"), (1_000, "Thousand")):
        group, remainder = divmod(remainder, divisor)
        if group:
            parts.append(f"{under_thousand(group)} {label}")
    if remainder:
        parts.append(under_thousand(remainder))
    if not parts:
        parts.append("Zero")
    paise = int((abs(value) - rupees) * 100)
    paise_text = f" and {under_hundred(paise)} Paise" if paise else ""
    return f"Rupees {' '.join(parts)}{paise_text} Only"


def fit_text(c: canvas.Canvas, text: str, max_width: float, font: str, size: float) -> str:
    if stringWidth(text, font, size) <= max_width:
        return text
    suffix = "..."
    candidate = text
    while candidate and stringWidth(candidate + suffix, font, size) > max_width:
        candidate = candidate[:-1]
    return candidate.rstrip() + suffix


def wrapped_lines(c: canvas.Canvas, text: str, max_width: float, font: str, size: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_text_block(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font: str = "Helvetica",
    size: float = 8,
    leading: float = 10,
    max_lines: int = 3,
) -> float:
    lines = wrapped_lines(c, text, max_width, font, size)[:max_lines]
    c.setFont(font, size)
    c.setFillColor(INK)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def line(c: canvas.Canvas, x1: float, y1: float, x2: float, y2: float, color=GRID, width=0.6) -> None:
    c.setStrokeColor(color)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)


def draw_header(c: canvas.Canvas, inv: Invoice, page_number: int, page_count: int) -> float:
    accent = {
        "classic": BLUE,
        "modern": colors.HexColor("#0F766E"),
        "mono": colors.HexColor("#343A40"),
        "compact": colors.HexColor("#7C2D12"),
    }.get(inv.layout, BLUE)
    c.setFillColor(accent)
    c.rect(0, PAGE_H - 13, PAGE_W, 13, stroke=0, fill=1)

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(34, PAGE_H - 45, fit_text(c, inv.supplier.name, 330, "Helvetica-Bold", 17))
    c.setFont("Helvetica", 7.7)
    c.setFillColor(MUTED)
    c.drawString(34, PAGE_H - 59, inv.supplier.address)
    c.drawString(34, PAGE_H - 71, f"GSTIN: {inv.supplier.gstin or '-'}")
    c.drawString(34, PAGE_H - 82, f"{inv.supplier.phone}  |  {inv.supplier.email}")

    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 15)
    c.drawRightString(PAGE_W - 34, PAGE_H - 43, "TAX INVOICE")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(PAGE_W - 34, PAGE_H - 60, f"Invoice No: {inv.number or '-'}")
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_W - 34, PAGE_H - 73, f"Date: {inv.invoice_date or '-'}")
    if page_count > 1:
        c.drawRightString(PAGE_W - 34, PAGE_H - 86, f"Page {page_number} of {page_count}")

    line(c, 34, PAGE_H - 96, PAGE_W - 34, PAGE_H - 96, accent, 1)
    return PAGE_H - 111


def draw_party_section(c: canvas.Canvas, inv: Invoice, y: float) -> float:
    buyer = inv.buyer
    c.setFillColor(PALE)
    c.roundRect(34, y - 83, 527, 78, 5, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(45, y - 18, "BILL TO")
    c.drawString(312, y - 18, "DISPATCH DETAILS")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(45, y - 34, fit_text(c, buyer["name"], 245, "Helvetica-Bold", 10))
    c.setFont("Helvetica", 7.7)
    draw_text_block(c, buyer["address"], 45, y - 47, 240, size=7.7, leading=9, max_lines=2)
    c.drawString(45, y - 72, f"GSTIN: {buyer['gstin'] or '-'}")
    c.drawString(312, y - 35, f"Vehicle: {inv.vehicle or '-'}")
    c.drawString(312, y - 50, f"Place of supply: {buyer['state']} ({buyer['state_code']})")
    c.drawString(312, y - 65, f"Supplier state: {inv.supplier.state} ({inv.supplier.state_code})")
    return y - 96


def draw_table_header(c: canvas.Canvas, y: float) -> float:
    c.setFillColor(colors.HexColor("#E9EEF5"))
    c.rect(34, y - 21, 527, 21, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 6.7)
    headers = [
        ("DESCRIPTION", 40),
        ("HSN", 239),
        ("QTY", 300),
        ("UNIT", 344),
        ("RATE", 386),
        ("TAXABLE", 483),
    ]
    for label, x in headers:
        c.drawString(x, y - 14, label)
    return y - 21


def draw_item_row(c: canvas.Canvas, item: Item, y: float, row_number: int) -> float:
    height = 30
    if row_number % 2 == 0:
        c.setFillColor(colors.HexColor("#FAFBFC"))
        c.rect(34, y - height, 527, height, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica", 7.5)
    c.drawString(40, y - 12, fit_text(c, item.description, 190, "Helvetica", 7.5))
    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawString(40, y - 23, f"Line {row_number}")
    c.setFillColor(INK)
    c.drawString(239, y - 17, item.hsn or "-")
    c.drawRightString(333, y - 17, f"{item.quantity.normalize():f}")
    c.drawString(344, y - 17, item.unit)
    c.drawRightString(463, y - 17, indian(item.rate))
    c.drawRightString(553, y - 17, indian(item.printed_taxable))
    line(c, 34, y - height, 561, y - height)
    return y - height


def draw_tax_summary(c: canvas.Canvas, inv: Invoice, y: float) -> float:
    rows: list[tuple[str, Decimal]] = [("Material taxable value", inv.taxable)]
    if inv.freight_amount:
        rows.append((f"Freight inward @ {inv.freight_gst_rate.normalize():f}%", inv.freight_amount))
    if inv.mode == "local":
        rows.extend([("Input CGST 9%", inv.cgst), ("Input SGST 9%", inv.sgst)])
    else:
        rows.append(("Input IGST 18%", inv.igst))
    if inv.tds:
        rows.append(("Less: TDS 194Q @ 0.10%", -inv.tds))
    if inv.transport_tds:
        rows.append(("Less: Transport TDS @ 1%", -inv.transport_tds))
    if inv.cgst_tds:
        rows.append(("Less: CGST TDS @ 1%", -inv.cgst_tds))
    if inv.sgst_tds:
        rows.append(("Less: SGST TDS @ 1%", -inv.sgst_tds))
    if inv.igst_tds:
        rows.append(("Less: IGST TDS @ 2%", -inv.igst_tds))
    if inv.tcs_amount:
        rows.append(("Add: TCS", inv.tcs_amount))
    if inv.round_off:
        rows.append(("Round-off", inv.round_off))

    if inv.tax_text_only:
        rows = [("Material taxable value", inv.taxable)]
        if inv.freight_amount:
            rows.append((f"Freight inward @ {inv.freight_gst_rate.normalize():f}%", inv.freight_amount))
        if inv.tds:
            rows.append(("Less: TDS 194Q @ 0.10%", -inv.tds))
        if inv.transport_tds:
            rows.append(("Less: Transport TDS @ 1%", -inv.transport_tds))
        if inv.cgst_tds:
            rows.append(("Less: CGST TDS @ 1%", -inv.cgst_tds))
        if inv.sgst_tds:
            rows.append(("Less: SGST TDS @ 1%", -inv.sgst_tds))
        if inv.igst_tds:
            rows.append(("Less: IGST TDS @ 2%", -inv.igst_tds))
        if inv.round_off:
            rows.append(("Round-off", inv.round_off))

    box_h = max(122, 65 + len(rows) * 15) + (20 if inv.notes else 0)
    c.setStrokeColor(GRID)
    c.setLineWidth(0.7)
    c.roundRect(318, y - box_h, 243, box_h, 5, stroke=1, fill=0)

    c.setFont("Helvetica", 7.8)
    c.setFillColor(INK)
    current = y - 17
    if inv.tax_text_only:
        c.drawString(330, current, "GST applicable at 18% on taxable basis")
        current -= 16
    for label, value in rows:
        c.drawString(330, current, label)
        c.drawRightString(549, current, indian(value))
        current -= 15
    line(c, 327, current + 5, 552, current + 5)
    c.setFont("Helvetica-Bold", 9.2)
    c.drawString(330, current - 10, "Invoice total")
    c.drawRightString(549, current - 10, f"Rs. {indian(inv.total)}")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(34, y - 15, "Amount in words")
    draw_text_block(c, amount_words(inv.total), 34, y - 30, 265, "Helvetica-Bold", 8.3, 11, 3)
    c.setFont("Helvetica", 7.2)
    c.setFillColor(INK)
    c.drawString(34, y - 72, "Payment terms: 15 days from invoice date.")
    c.drawString(34, y - 86, "Bank: Industrial Co-operative Bank")
    c.drawString(34, y - 100, "A/c: 00481276009  |  IFSC: INDB0000412")

    if inv.notes:
        c.setFont("Helvetica", 7)
        c.setFillColor(MUTED)
        c.drawString(34, y - 119, "Remarks:")
        remark_y = y - 132
        for note in inv.notes[:2]:
            c.drawString(72, remark_y, fit_text(c, note, 225, "Helvetica", 7))
            remark_y -= 10

    return y - box_h


def draw_footer(c: canvas.Canvas, inv: Invoice, y: float, issuer: str | None = None) -> None:
    y = max(y, 42)
    line(c, 34, y, PAGE_W - 34, y)
    c.setFont("Helvetica", 6.7)
    c.setFillColor(MUTED)
    c.drawString(34, y - 13, "Goods once supplied will be governed by the terms shown above.")
    c.drawString(34, y - 24, "Subject to the supplier's local jurisdiction.")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 7.3)
    c.drawRightString(PAGE_W - 34, y - 13, f"For {issuer or inv.supplier.name}")
    c.setFont("Helvetica", 6.7)
    c.drawRightString(PAGE_W - 34, y - 29, "Authorised signatory")


def draw_invoice_pages(c: canvas.Canvas, inv: Invoice) -> None:
    lines_per_page = max(7, inv.page_lines)
    page_count = max(1, math.ceil(len(inv.items) / lines_per_page))
    for page_idx in range(page_count):
        y = draw_header(c, inv, page_idx + 1, page_count)
        y = draw_party_section(c, inv, y)
        y = draw_table_header(c, y)
        start = page_idx * lines_per_page
        end = min(start + lines_per_page, len(inv.items))
        for row_idx, item in enumerate(inv.items[start:end], start=start + 1):
            y = draw_item_row(c, item, y, row_idx)
        if page_idx == page_count - 1:
            y -= 12
            y = draw_tax_summary(c, inv, y)
            draw_footer(c, inv, y - 11)
        else:
            c.setFont("Helvetica-Oblique", 7.2)
            c.setFillColor(MUTED)
            c.drawRightString(PAGE_W - 34, y - 19, "Continued on next page")
            draw_footer(c, inv, 63)
        c.showPage()


def draw_invoice_pdf(path: Path, inv: Invoice) -> None:
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    c.setTitle(f"Tax Invoice {inv.number}")
    c.setAuthor(inv.supplier.name)
    draw_invoice_pages(c, inv)
    c.save()


def draw_eway_page(c: canvas.Canvas, inv: Invoice, bill_number: str, complete_goods: bool = True) -> None:
    c.setFillColor(colors.HexColor("#1F2937"))
    c.rect(0, PAGE_H - 14, PAGE_W, 14, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", 18)
    c.setFillColor(INK)
    c.drawString(34, PAGE_H - 51, "E-WAY BILL")
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(PAGE_W - 34, PAGE_H - 47, f"Bill No: {bill_number}")
    c.setFont("Helvetica", 7.5)
    c.drawRightString(PAGE_W - 34, PAGE_H - 61, f"Generated: {inv.invoice_date}")
    line(c, 34, PAGE_H - 78, PAGE_W - 34, PAGE_H - 78, INK, 1)
    y = PAGE_H - 103
    fields = [
        ("Document", inv.number),
        ("Supplier", inv.supplier.name),
        ("From GSTIN", inv.supplier.gstin),
        ("Recipient", inv.buyer["name"]),
        ("To GSTIN", inv.buyer["gstin"]),
        ("Vehicle", inv.vehicle),
        ("Taxable Value", f"Rs. {indian(inv.gst_taxable)}"),
        ("GST Amount", f"Rs. {indian(inv.cgst + inv.sgst + inv.igst)}"),
        ("Document Value", f"Rs. {indian(inv.total)}"),
    ]
    for idx, (label, value) in enumerate(fields):
        x = 34 if idx % 2 == 0 else 304
        row = idx // 2
        yy = y - row * 42
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(MUTED)
        c.drawString(x, yy, label.upper())
        c.setFont("Helvetica", 9)
        c.setFillColor(INK)
        c.drawString(x, yy - 15, fit_text(c, value, 245, "Helvetica", 9))
    table_y = y - 232
    c.setFillColor(PALE)
    c.rect(34, table_y - 22, 527, 22, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(MUTED)
    for label, x in [("GOODS", 42), ("HSN", 320), ("QTY", 399), ("UNIT", 470)]:
        c.drawString(x, table_y - 15, label)
    yy = table_y - 22
    goods = inv.items if complete_goods else inv.items[:1]
    for item in goods[:8]:
        yy -= 29
        c.setFont("Helvetica", 8)
        c.setFillColor(INK)
        c.drawString(42, yy + 11, fit_text(c, item.description, 260, "Helvetica", 8))
        c.drawString(320, yy + 11, item.hsn)
        c.drawRightString(446, yy + 11, f"{item.quantity.normalize():f}")
        c.drawString(470, yy + 11, item.unit)
        line(c, 34, yy, 561, yy)
    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawString(34, 48, "This document accompanies the movement of goods described above.")


def packet_items(inv: Invoice) -> list[Item]:
    grouped: dict[tuple[str, str, str], dict[str, Decimal | str]] = {}
    for item in inv.items:
        family = (
            "Mild Steel Scrap"
            if item.hsn.startswith("7204")
            else "Sponge Iron"
            if item.hsn == "72031000"
            else item.description
        )
        key = (family, item.hsn, item.unit)
        bucket = grouped.setdefault(
            key,
            {
                "description": family,
                "hsn": item.hsn,
                "unit": item.unit,
                "quantity": Decimal("0"),
                "taxable": Decimal("0"),
            },
        )
        bucket["quantity"] = Decimal(str(bucket["quantity"])) + item.quantity
        bucket["taxable"] = Decimal(str(bucket["taxable"])) + item.printed_taxable
    results: list[Item] = []
    for bucket in grouped.values():
        quantity = Decimal(str(bucket["quantity"]))
        taxable = money(bucket["taxable"])
        rate = money(taxable / quantity) if quantity else Decimal("0")
        results.append(
            Item(
                str(bucket["description"]),
                str(bucket["hsn"]),
                quantity,
                str(bucket["unit"]),
                rate,
                taxable,
            )
        )
    return results


def draw_purchase_order_page(c: canvas.Canvas, inv: Invoice, po_number: str) -> None:
    accent = colors.HexColor("#263F70")
    c.setFillColor(accent)
    c.rect(0, PAGE_H - 14, PAGE_W, 14, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(34, PAGE_H - 51, inv.buyer["name"])
    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    c.drawString(34, PAGE_H - 65, inv.buyer["address"])
    c.drawString(34, PAGE_H - 77, f"GSTIN: {inv.buyer['gstin']}")
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 15)
    c.drawRightString(PAGE_W - 34, PAGE_H - 48, "PURCHASE ORDER")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(PAGE_W - 34, PAGE_H - 64, f"PO No: {po_number}")
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_W - 34, PAGE_H - 77, f"Date: {inv.invoice_date or '-'}")
    line(c, 34, PAGE_H - 94, PAGE_W - 34, PAGE_H - 94, accent, 1)

    y = PAGE_H - 115
    c.setFillColor(PALE)
    c.roundRect(34, y - 76, 527, 72, 5, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(45, y - 18, "SUPPLIER")
    c.drawString(314, y - 18, "DELIVERY")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(45, y - 35, fit_text(c, inv.supplier.name, 240, "Helvetica-Bold", 10))
    c.setFont("Helvetica", 7.5)
    c.drawString(45, y - 50, f"GSTIN: {inv.supplier.gstin or '-'}")
    c.drawString(45, y - 64, f"State: {inv.supplier.state}")
    c.drawString(314, y - 35, "Solution Nyx - Stores")
    c.drawString(314, y - 50, f"Vehicle reference: {inv.vehicle or '-'}")
    c.drawString(314, y - 64, "Delivery terms: By road")
    y -= 92

    y = draw_table_header(c, y)
    for idx, item in enumerate(packet_items(inv), 1):
        y = draw_item_row(c, item, y, idx)
    y -= 14
    order_value = money(inv.taxable + inv.freight_amount + inv.cgst + inv.sgst + inv.igst)
    c.setStrokeColor(GRID)
    c.roundRect(336, y - 84, 225, 84, 5, stroke=1, fill=0)
    c.setFont("Helvetica", 8)
    c.setFillColor(INK)
    c.drawString(348, y - 20, "Basic value")
    c.drawRightString(549, y - 20, indian(inv.taxable))
    c.drawString(348, y - 35, "Freight")
    c.drawRightString(549, y - 35, indian(inv.freight_amount))
    c.drawString(348, y - 50, "GST")
    c.drawRightString(549, y - 50, indian(inv.cgst + inv.sgst + inv.igst))
    line(c, 345, y - 58, 552, y - 58)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(348, y - 74, "Order value")
    c.drawRightString(549, y - 74, f"Rs. {indian(order_value)}")
    c.setFont("Helvetica", 7.5)
    c.drawString(34, y - 20, "Payment terms: 15 days from invoice date.")
    c.drawString(34, y - 37, "Inspection: Quantity and quality subject to store verification.")
    c.drawString(34, y - 54, "Tax: As applicable under GST.")
    draw_footer(c, inv, 69, issuer=inv.buyer["name"])


def draw_weighment_page(c: canvas.Canvas, inv: Invoice, slip_number: str) -> None:
    accent = colors.HexColor("#374151")
    c.setFillColor(accent)
    c.rect(0, PAGE_H - 14, PAGE_W, 14, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(34, PAGE_H - 51, "Industrial Weighbridge Services")
    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    c.drawString(34, PAGE_H - 66, "Taloja MIDC, Navi Mumbai - 410208")
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 15)
    c.drawRightString(PAGE_W - 34, PAGE_H - 48, "WEIGHMENT SLIP")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(PAGE_W - 34, PAGE_H - 64, f"Slip No: {slip_number}")
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_W - 34, PAGE_H - 77, f"Date: {inv.invoice_date or '-'}")
    line(c, 34, PAGE_H - 94, PAGE_W - 34, PAGE_H - 94, accent, 1)

    y = PAGE_H - 120
    fields = [
        ("Vehicle", inv.vehicle or "-"),
        ("Supplier", inv.supplier.name),
        ("Consignee", inv.buyer["name"]),
        ("Material", " / ".join(item.description for item in packet_items(inv))),
    ]
    for idx, (label, value) in enumerate(fields):
        x = 34 if idx % 2 == 0 else 310
        yy = y - (idx // 2) * 48
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(x, yy, label.upper())
        c.setFillColor(INK)
        c.setFont("Helvetica", 9)
        c.drawString(x, yy - 16, fit_text(c, value, 245, "Helvetica", 9))
    y -= 122
    quantity = sum((item.quantity for item in inv.items), Decimal("0"))
    tare = Decimal("18.500")
    gross = tare + quantity
    c.setFillColor(PALE)
    c.rect(34, y - 26, 527, 26, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 7)
    for heading, x in [("READING", 45), ("WEIGHT", 235), ("TIME", 430)]:
        c.drawString(x, y - 17, heading)
    readings = [
        ("Gross weight", f"{gross:.3f} MT", "10:12"),
        ("Tare weight", f"{tare:.3f} MT", "10:34"),
        ("Net weight", f"{quantity:.3f} MT", "10:34"),
    ]
    yy = y - 26
    for label, weight, time in readings:
        yy -= 38
        c.setFillColor(INK)
        c.setFont("Helvetica", 9)
        c.drawString(45, yy + 14, label)
        c.drawString(235, yy + 14, weight)
        c.drawString(430, yy + 14, time)
        line(c, 34, yy, 561, yy)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    c.drawString(34, 58, "Vehicle driver")
    c.drawRightString(PAGE_W - 34, 58, "Weighbridge operator")
    line(c, 34, 70, 180, 70)
    line(c, PAGE_W - 180, 70, PAGE_W - 34, 70)


def draw_challan_page(c: canvas.Canvas, inv: Invoice, challan_number: str) -> None:
    c.setFillColor(colors.HexColor("#7C2D12"))
    c.rect(0, PAGE_H - 14, PAGE_W, 14, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(34, PAGE_H - 51, "DELIVERY CHALLAN")
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(PAGE_W - 34, PAGE_H - 47, f"Challan: {challan_number}")
    c.setFont("Helvetica", 7.5)
    c.drawRightString(PAGE_W - 34, PAGE_H - 61, f"Date: {inv.invoice_date}")
    line(c, 34, PAGE_H - 78, PAGE_W - 34, PAGE_H - 78, INK, 1)
    y = PAGE_H - 105
    c.setFont("Helvetica-Bold", 8)
    c.drawString(34, y, f"Consignor: {inv.supplier.name}")
    c.drawString(34, y - 22, f"Consignee: {inv.buyer['name']}")
    c.drawString(34, y - 44, f"Vehicle: {inv.vehicle}")
    y -= 77
    y = draw_table_header(c, y)
    for idx, item in enumerate(packet_items(inv)[:10], 1):
        y = draw_item_row(c, item, y, idx)
    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawString(34, 48, "Received the goods described above in apparent good order.")


def write_single_page_pdf(path: Path, draw_page) -> None:
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    draw_page(c)
    c.showPage()
    c.save()


def build_packet_pdf(path: Path, inv: Invoice) -> None:
    reference = "".join(character for character in (inv.number or inv.filename) if character.isalnum())[-8:]
    po_number = f"SNX/PO/26-27/{reference[-4:] or '0001'}"
    challan_number = f"{inv.supplier.name.split()[0][:3].upper()}/DC/{reference[-5:] or '00001'}"
    slip_number = f"IWS/2607/{reference[-5:] or '00001'}"
    digest = hashlib.sha1(f"{inv.number}|{inv.supplier.gstin}".encode("utf-8")).hexdigest()
    bill_number = f"27{int(digest[:12], 16) % 10**10:010d}"

    invoice_for_render = inv
    if inv.scenario_id == "S21":
        invoice_for_render = replace(
            inv,
            items=inv.items[:1],
            printed_cgst=inv.cgst,
            printed_sgst=inv.sgst,
            printed_igst=inv.igst,
            tds_amount=inv.tds,
            printed_total=inv.total,
        )
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    c.setTitle(f"Purchase packet {inv.number or path.stem}")
    c.setAuthor(inv.supplier.name)
    draw_purchase_order_page(c, inv, po_number)
    c.showPage()
    draw_invoice_pages(c, invoice_for_render)
    if inv.scenario_id == "S20":
        draw_invoice_pages(c, invoice_for_render)
    draw_challan_page(c, inv, challan_number)
    c.showPage()
    draw_weighment_page(c, inv, slip_number)
    c.showPage()
    draw_eway_page(c, inv, bill_number, complete_goods=True)
    c.showPage()
    if inv.scenario_id == "S22":
        conflicting_inv = replace(inv, vehicle="MH14ZX7408")
        draw_challan_page(c, conflicting_inv, f"{challan_number}/A")
        c.showPage()
    if inv.scenario_id == "B10":
        second = Invoice(
            "unused.pdf",
            "B10-second",
            build_scenarios()[1].supplier,
            "WRI/0726/493",
            "28-07-2026",
            "GJ01LR4075",
            [Item("Mild Steel Scrap - HMS", "72044900", Decimal("3"), "MT", Decimal("26800"))],
            "modern",
        )
        draw_invoice_pages(c, second)
        draw_eway_page(c, second, "271194630821", complete_goods=True)
        c.showPage()
    c.save()


def append_supporting_pages(path: Path, inv: Invoice, include_challan: bool = False) -> None:
    support = TMP / f"{path.stem}-support.pdf"
    c = canvas.Canvas(str(support), pagesize=A4, pageCompression=1)
    draw_eway_page(c, inv, f"271126074985", complete_goods=True)
    c.showPage()
    if include_challan:
        draw_challan_page(c, inv, f"DC/{inv.number.replace('/', '-')}")
        c.showPage()
    c.save()
    merge_pdfs([path, support], path)


def merge_pdfs(inputs: list[Path], output: Path) -> None:
    writer = PdfWriter()
    for item in inputs:
        # append() clones each source document's resource tree as a unit. Adding
        # pages from separate ReportLab readers can collide on font/resource names
        # and leave otherwise valid table text clipped in the merged output.
        writer.append(str(item))
    temp_output = output.with_suffix(".merge.pdf")
    with temp_output.open("wb") as handle:
        writer.write(handle)
    temp_output.replace(output)


def duplicate_first_page(path: Path) -> None:
    reader = PdfReader(str(path))
    writer = PdfWriter()
    writer.add_page(reader.pages[0])
    writer.add_page(reader.pages[0])
    for page in reader.pages[1:]:
        writer.add_page(page)
    temp_output = path.with_suffix(".duplicate.pdf")
    with temp_output.open("wb") as handle:
        writer.write(handle)
    temp_output.replace(path)


def rasterize_pdf(pdf: Path, destination: Path, dpi: int = 150) -> list[Path]:
    destination.mkdir(parents=True, exist_ok=True)
    prefix = destination / "page"
    subprocess.run(
        [str(RENDERER), "-png", "-r", str(dpi), str(pdf), str(prefix)],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return sorted(destination.glob("page-*.png"))


def transform_pdf(path: Path, transform: str) -> None:
    render_dir = TMP / "raster" / path.stem
    images = rasterize_pdf(path, render_dir, dpi=145)
    processed: list[Path] = []
    for idx, image_path in enumerate(images, 1):
        image = Image.open(image_path).convert("RGB")
        if transform == "scan":
            image = ImageEnhance.Contrast(image).enhance(0.88)
            image = ImageEnhance.Color(image).enhance(0.08)
            image = image.filter(ImageFilter.GaussianBlur(radius=0.35))
            noise = Image.effect_noise(image.size, 5).convert("L")
            noise_rgb = Image.merge("RGB", (noise, noise, noise))
            image = Image.blend(image, noise_rgb, 0.025)
        elif transform == "low_resolution":
            small = image.resize((max(1, image.width // 3), max(1, image.height // 3)))
            image = small.resize(image.size)
            image = ImageEnhance.Contrast(image).enhance(0.92)
        elif transform == "skew":
            image = image.rotate(1.25, resample=Image.Resampling.BICUBIC, expand=False, fillcolor="white")
            image = ImageEnhance.Contrast(image).enhance(0.9)
        elif transform == "faded_stamp":
            image = ImageEnhance.Contrast(image).enhance(0.62)
            overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(overlay)
            x = int(image.width * 0.57)
            y = int(image.height * 0.24)
            draw.ellipse((x, y, x + 260, y + 110), outline=(170, 28, 28, 150), width=7)
            draw.text((x + 38, y + 38), "RECEIVED", fill=(170, 28, 28, 165))
            image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
        out = render_dir / f"processed-{idx:02d}.jpg"
        image.save(out, "JPEG", quality=58 if transform == "low_resolution" else 76)
        processed.append(out)

    c = canvas.Canvas(str(path.with_suffix(".raster.pdf")), pagesize=A4, pageCompression=1)
    for processed_path in processed:
        c.drawImage(str(processed_path), 0, 0, PAGE_W, PAGE_H, preserveAspectRatio=False, mask="auto")
        c.showPage()
    c.save()
    path.with_suffix(".raster.pdf").replace(path)


def supplier(
    name: str,
    state: str,
    state_code: str,
    pan: str,
    city: str,
    phone_suffix: str,
) -> Supplier:
    slug = "".join(part.lower() for part in name.split()[:2])
    return Supplier(
        name=name,
        gstin=make_gstin(state_code, pan),
        state=state,
        state_code=state_code,
        address=f"Plot {int(phone_suffix[-2:]) + 10}, Industrial Area, {city}",
        phone=f"+91 98{phone_suffix}",
        email=f"accounts@{slug}.in",
    )


def build_scenarios() -> list[Invoice]:
    mh_scrap = supplier(
        "Sahyadri Recycling Works",
        "Maharashtra",
        "27",
        "AAXFS3812K",
        "Pune - 411019",
        "41263821",
    )
    gj_scrap = supplier(
        "Western Reclaim Industries",
        "Gujarat",
        "24",
        "AACFW5274R",
        "Ahmedabad - 382445",
        "51674209",
    )
    ka_sponge = supplier(
        "Deccan Sponge and Minerals",
        "Karnataka",
        "29",
        "AAHFD6182M",
        "Ballari - 583101",
        "60753184",
    )
    mh_sponge = supplier(
        "Vidarbha Iron Resources",
        "Maharashtra",
        "27",
        "AAEFV7421L",
        "Nagpur - 440016",
        "31856472",
    )
    wb_mixed = supplier(
        "Eastern Circular Metals",
        "West Bengal",
        "19",
        "AACFE2956Q",
        "Howrah - 711302",
        "41927563",
    )
    mh_precision = supplier(
        "Precision Alloy Recovery",
        "Maharashtra",
        "27",
        "AAKFP8347D",
        "Nashik - 422010",
        "52318649",
    )
    all_valid_suppliers = [mh_scrap, gj_scrap, ka_sponge, mh_sponge, wb_mixed, mh_precision]

    scrap = lambda qty, rate, description="Mild Steel Scrap - HMS", hsn="72044900", unit="MT", taxable=None: Item(
        description, hsn, Decimal(str(qty)), unit, Decimal(str(rate)), money(taxable) if taxable is not None else None
    )
    sponge = lambda qty, rate, description="Sponge Iron Lumps", hsn="72031000", unit="MT", taxable=None: Item(
        description, hsn, Decimal(str(qty)), unit, Decimal(str(rate)), money(taxable) if taxable is not None else None
    )

    scenarios: list[Invoice] = [
        Invoice(
            "SRW-184.pdf", "S01", mh_scrap, "SRW/26-27/184", "18-07-2026", "MH12RT4821",
            [scrap("10", "25000")], "classic"
        ),
        Invoice(
            "WRI-419.pdf", "S02", gj_scrap, "WRI/0726/419", "19-07-2026", "GJ01KV7392",
            [scrap("8", "26875")], "modern"
        ),
        Invoice(
            "DSM-087.pdf", "S03", ka_sponge, "DSM/26-27/087", "20-07-2026", "KA34AB2094",
            [sponge("12", "23100")], "mono", tds_rate=Decimal("0")
        ),
        Invoice(
            "VIR-114.pdf", "S04", mh_sponge, "VIR/0726/114", "20-07-2026", "MH40CD6185",
            [sponge("9", "22850")], "compact", tds_rate=Decimal("0")
        ),
        Invoice(
            "ECM-233.pdf", "S05", wb_mixed, "ECM/INV/2607/233", "21-07-2026", "WB11F58264",
            [scrap("4", "26400"), sponge("6", "22900")], "modern"
        ),
        Invoice(
            "PAR-311.pdf", "S06", mh_precision, "PAR/26-27/311", "21-07-2026", "MH15KL4729",
            [scrap("3.5", "25200"), sponge("2.25", "23200")], "compact",
            freight_amount=Decimal("12400")
        ),
        Invoice(
            "SRW-196.pdf", "S07", mh_scrap, "SRW/26-27/196", "22-07-2026", "MH12QW9913",
            [
                scrap("2", "24750", "Heavy Melting Scrap", "72041000"),
                scrap("1.5", "25300", "Shredded Ferrous Scrap", "72042990"),
                scrap("2.25", "24900", "Mild Steel Turning Scrap", "72044100"),
            ],
            "mono",
        ),
        Invoice(
            "PAR-329.pdf", "S08", mh_precision, "PAR/26-27/329", "22-07-2026", "MH15TR8307",
            [scrap("7.375", "24887.50", "Mild Steel Plate Cuttings")], "modern", round_off=Decimal("-0.18")
        ),
        Invoice(
            "WRI-447.pdf", "S09", gj_scrap, "WRI/0726/447", "23-07-2026", "GJ01HT8825",
            [scrap("5", "27000")], "classic", tcs_amount=Decimal("135.00"),
            notes=["TCS collected at 0.1% as shown in the invoice summary."]
        ),
        Invoice(
            "VIR-126.pdf", "S10", mh_sponge, "VIR/0726/126", "23-07-2026", "MH40LU2816",
            [sponge("11", "22975")], "modern", tds_rate=Decimal("0"),
            freight_amount=Decimal("7800"), round_off=Decimal("0.25")
        ),
        Invoice(
            "ECM-249.pdf", "S11", wb_mixed, "ECM/INV/2607/249", "24-07-2026", "WB11B74429",
            [scrap("6", "26325")], "compact", round_off=Decimal("-0.50")
        ),
        Invoice(
            "DSM-102.pdf", "S12", ka_sponge, "DSM/26-27/102", "24-07-2026", "KA34MN5931",
            [
                sponge("0.50", str(22400 + (idx % 5) * 125), f"Sponge Iron Lot {idx + 1:02d}")
                for idx in range(30)
            ],
            "mono",
            tds_rate=Decimal("0"),
            page_lines=11,
        ),
        Invoice(
            "SRW-208.pdf", "S13", mh_scrap, "SRW/26-27/208", "25-07-2026", "MH12PS3168",
            [scrap("6", "25150")], "classic", transform="scan"
        ),
        Invoice(
            "WRI-463.pdf", "S14", gj_scrap, "WRI/0726/463", "25-07-2026", "GJ01ZA6402",
            [scrap("7", "26725")], "modern", transform="low_resolution"
        ),
        Invoice(
            "DSM-116.pdf", "S15", ka_sponge, "DSM/26-27/116", "25-07-2026", "KA34EH4720",
            [sponge("8", "23250")], "mono", tds_rate=Decimal("0"), transform="skew"
        ),
        Invoice(
            "PAR-344.pdf", "S16", mh_precision, "PAR/26-27/344", "26-07-2026", "MH15BV6294",
            [scrap("4.75", "24980")], "compact", transform="faded_stamp"
        ),
        Invoice(
            "ECM-265.pdf", "S17", wb_mixed, "ECM/INV/2607/265", "26-07-2026", "WB11C87261",
            [
                scrap("1", str(25750 + idx * 25), f"Ferrous Scrap Lot {idx + 1:02d}", "72044900")
                for idx in range(18)
            ],
            "classic",
            page_lines=9,
        ),
        Invoice(
            "SRW-215.pdf", "S18", mh_scrap, "SRW/26-27/215", "26-07-2026", "MH12MR5819",
            [scrap("9", "25250")], "modern", tax_text_only=True,
            expected="review_required", expected_blockers=["invoice tax amounts absent"]
        ),
        Invoice(
            "VIR-139.pdf", "S19", mh_sponge, "VIR/0726/139", "27.07.2026", "MH40GD1938",
            [sponge("6.25", "23040")], "classic", tds_rate=Decimal("0")
        ),
        Invoice(
            "WRI-478.pdf", "S20", gj_scrap, "WRI/0726/478", "27-07-2026", "GJ01DF2846",
            [scrap("3", "26900")], "mono", expected="review_required",
            expected_blockers=["duplicate source page"]
        ),
        Invoice(
            "ECM-278.pdf", "S21", wb_mixed, "ECM/INV/2607/278", "27-07-2026", "WB11H72941",
            [scrap("2", "26450"), sponge("3", "23025")], "compact",
            expected="postable_after_supporting_document_review"
        ),
        Invoice(
            "PAR-358.pdf", "S22", mh_precision, "PAR/26-27/358", "27-07-2026", "MH15XN4832",
            [scrap("5", "25080")], "modern", expected="review_required",
            expected_blockers=["ambiguous supporting document set"]
        ),
        Invoice(
            "SRW-226.pdf", "B01", mh_scrap, "SRW/26-27/226", "27-07-2026", "MH12TV6084",
            [scrap("5", "25100")], "classic",
            buyer_override={**BUYER, "name": "Solution Nexus", "gstin": "29BBBBB0000B1Z1", "state": "Karnataka", "state_code": "29"},
            expected="blocked", expected_blockers=["buyer GSTIN does not match Solution Nyx"],
        ),
        Invoice(
            "KCM-071.pdf", "B02",
            Supplier(
                "Konkan Circular Metals", "27ABCDE1234F1Z", "Maharashtra", "27",
                "Gate 3, Harbour Industrial Zone, Raigad - 410206", "+91 9821345086", "accounts@konkancircular.in"
            ),
            "KCM/26-27/071", "27-07-2026", "MH06PL7314", [scrap("4", "24950")], "mono",
            expected="blocked", expected_blockers=["invalid supplier GSTIN"], create_supplier_in_tally=False,
        ),
        Invoice(
            "WRI-486.pdf", "B03", gj_scrap, "WRI/0726/486", "27-07-2026", "GJ01JP5192",
            [Item("Alloy Residue", "99999999", Decimal("2"), "MT", Decimal("48750"))], "compact",
            expected="blocked", expected_blockers=["unknown HSN requires manual stock mapping"],
        ),
        Invoice(
            "PAR-367.pdf", "B04", mh_precision, "PAR/26-27/367", "27-07-2026", "MH15KA9174",
            [scrap("10", "25000", taxable="247500")], "modern",
            expected="blocked", expected_blockers=["quantity multiplied by rate does not equal taxable value"],
        ),
        Invoice(
            "SRW-231.pdf", "B05", mh_scrap, "SRW/26-27/231", "28-07-2026", "MH12RQ2561",
            [scrap("8", "25000")], "classic", printed_cgst=Decimal("17500"), printed_sgst=Decimal("17500"),
            expected="blocked", expected_blockers=["printed GST differs from calculated GST"],
        ),
        Invoice(
            "DSM-124.pdf", "B06", ka_sponge, "DSM/26-27/124", "28-07-2026", "KA34UL8062",
            [sponge("10", "23000")], "mono", tds_rate=Decimal("0"), printed_total=Decimal("275000"),
            expected="blocked", expected_blockers=["invoice total does not reconcile"],
        ),
        Invoice(
            "VIR-147.pdf", "B07", mh_sponge, "VIR/0726/147", "", "MH40TZ5713",
            [sponge("5", "23100")], "compact", tds_rate=Decimal("0"),
            expected="blocked", expected_blockers=["invoice date missing"],
        ),
        Invoice(
            "ECM-undated-reference.pdf", "B08", wb_mixed, "", "28-07-2026", "WB11Q62489",
            [scrap("3", "26500")], "modern",
            expected="blocked", expected_blockers=["invoice number missing"],
        ),
        Invoice(
            "PAR-374.pdf", "B09", mh_precision, "PAR/26-27/374", "28-07-2026", "MH15CV7826",
            [scrap("0", "25100")], "classic",
            expected="blocked", expected_blockers=["quantity must be greater than zero"],
        ),
        Invoice(
            "mixed-invoices-28-07-2026.pdf", "B10", mh_scrap, "SRW/26-27/239", "28-07-2026", "MH12NT3975",
            [scrap("2", "25200")], "mono",
            expected="blocked", expected_blockers=["two distinct invoices in one source file"],
        ),
    ]
    assert len(scenarios) == 32
    assert all(supplier.gstin for supplier in all_valid_suppliers)
    return scenarios


SCENARIO_PURPOSES = {
    "S01": "Local MS scrap baseline: CGST/SGST, 194Q, and separate CGST/SGST GST-TDS.",
    "S02": "Interstate MS scrap baseline: IGST, 194Q, and IGST GST-TDS.",
    "S03": "Interstate Sponge Iron baseline with no scrap withholding.",
    "S04": "Local Sponge Iron baseline with no scrap withholding.",
    "S05": "Mixed MS scrap and Sponge Iron; scrap withholding applies only to the 7204 line.",
    "S06": "Local mixed-material invoice with freight, freight GST, transport TDS, 194Q, and GST-TDS.",
    "S07": "Several 7204-family HSN variants mapping to the client's combined stock master.",
    "S08": "Fractional quantity, high-precision rate, and negative round-off.",
    "S09": "Interstate scrap invoice containing explicit TCS evidence for reviewer confirmation.",
    "S10": "Local Sponge Iron with freight and transport TDS but no scrap/GST-TDS.",
    "S11": "Interstate scrap with a small round-off adjustment.",
    "S12": "Thirty invoice lines spanning multiple invoice pages.",
    "S13": "Readable scanned packet.",
    "S14": "Low-resolution packet.",
    "S15": "Slightly skewed packet.",
    "S16": "Faded packet with a received stamp.",
    "S17": "Long multi-page scrap invoice with many distinct lots.",
    "S18": "Invoice states the GST rate but omits component tax amounts; review is required.",
    "S19": "Alternate printed date format while preserving invoice date independently of voucher date.",
    "S20": "Duplicate invoice page in the same packet.",
    "S21": "Supporting documents contain an additional goods line not present on the invoice.",
    "S22": "An additional delivery challan conflicts on vehicle number.",
    "B01": "Buyer identity and GST registration do not match the selected Tally company.",
    "B02": "Supplier GSTIN is structurally invalid.",
    "B03": "Unknown HSN cannot be mapped automatically.",
    "B04": "Quantity multiplied by rate does not equal the printed taxable amount.",
    "B05": "Printed GST differs from the configured 18% calculation.",
    "B06": "Printed invoice total does not reconcile with its components.",
    "B07": "Supplier invoice date is missing.",
    "B08": "Supplier invoice number is missing.",
    "B09": "Invoice line quantity is zero.",
    "B10": "Two unrelated invoices were uploaded in one source PDF.",
}


def serialise_invoice(inv: Invoice) -> dict[str, Any]:
    invoice_line_count = 1 if inv.scenario_id == "S21" else len(inv.items)
    invoice_pages = max(1, math.ceil(invoice_line_count / inv.page_lines))
    packet_pages = 4 + invoice_pages
    documents = [
        "Purchase Order",
        "Tax Invoice",
        "Delivery Challan",
        "Weighment Slip",
        "E-Way Bill",
    ]
    if inv.scenario_id == "S20":
        packet_pages += invoice_pages
        documents.insert(2, "Duplicate Tax Invoice page")
    if inv.scenario_id == "S22":
        packet_pages += 1
        documents.append("Additional Delivery Challan")
    if inv.scenario_id == "B10":
        packet_pages += 2
        documents.extend(["Second Tax Invoice", "Second E-Way Bill"])
    return {
        "scenario_id": inv.scenario_id,
        "file": inv.filename,
        "purpose": SCENARIO_PURPOSES[inv.scenario_id],
        "expected": inv.expected,
        "expected_blockers": inv.expected_blockers,
        "supplier": asdict(inv.supplier),
        "buyer": inv.buyer,
        "invoice_number": inv.number,
        "invoice_date": inv.invoice_date,
        "vehicle_number": inv.vehicle,
        "tax_mode": inv.mode,
        "items": [
            {
                "description": item.description,
                "hsn": item.hsn,
                "quantity": str(item.quantity),
                "unit": item.unit,
                "rate": str(money(item.rate)),
                "line_taxable": str(item.printed_taxable),
                "calculated_line_taxable": str(item.calculated_taxable),
            }
            for item in inv.items
        ],
        "amounts": {
            "taxable": str(inv.taxable),
            "material_taxable": str(inv.taxable),
            "freight": str(money(inv.freight_amount)),
            "gst_taxable": str(inv.gst_taxable),
            "cgst": str(inv.cgst),
            "sgst": str(inv.sgst),
            "igst": str(inv.igst),
            "tds_194q": str(inv.tds),
            "transport_tds": str(inv.transport_tds),
            "cgst_tds": str(inv.cgst_tds),
            "sgst_tds": str(inv.sgst_tds),
            "igst_tds": str(inv.igst_tds),
            "total_withholding": str(inv.total_withholding),
            "tcs": str(money(inv.tcs_amount)),
            "round_off": str(money(inv.round_off)),
            "invoice_total": str(inv.total),
            "calculated_total_from_printed_components": str(inv.calculated_total),
        },
        "presentation": {
            "layout": inv.layout,
            "packet_pages_expected": packet_pages,
            "documents": documents,
            "invoice_pages": invoice_pages,
            "transform": inv.transform,
            "tax_text_only": inv.tax_text_only,
        },
        "tally_setup": {
            "create_supplier_ledger": inv.create_supplier_in_tally,
            "required_stock_items": sorted(
                {
                    "M S Scrap & Sponge Iron"
                    for item in inv.items
                    if item.hsn.startswith("7204") or item.hsn == "72031000"
                }
            ),
            "required_purchase_ledger": (
                "M.S. Scrap Purchase"
                if inv.mode == "local"
                else "O.M.S. Scrap Purchase"
            ),
            "required_tax_ledgers": (
                ["Input ITC CGST 9%", "Input ITC SGST 9%"]
                if inv.mode == "local"
                else ["Input ITC IGST 18%"]
            ),
            "required_charge_ledgers": (
                ["Transportation Inward @ 18.00%"] if inv.freight_amount else []
            ),
            "required_withholding_ledgers": [
                *(
                    ["TDS Payable @ 0.10% (194Q)"]
                    if inv.tds
                    else []
                ),
                *(
                    ["Tds on Goods Transport"]
                    if inv.transport_tds
                    else []
                ),
                *(
                    ["CGST TDS PAYABLE 1%", "SGST TDS PAYABLE 1%"]
                    if inv.cgst_tds or inv.sgst_tds
                    else []
                ),
                *(
                    ["IGST TDS PAYABLE 2%"]
                    if inv.igst_tds
                    else []
                ),
            ],
            "supplier_invoice_date": inv.invoice_date,
            "voucher_date_source": "posting date selected by the reviewer",
        },
    }


def write_readme(scenarios: list[Invoice]) -> None:
    matrix_rows = "\n".join(
        f"| {inv.scenario_id} | `{inv.filename}` | {inv.expected} | {SCENARIO_PURPOSES[inv.scenario_id]} |"
        for inv in scenarios
    )
    content = f"""# Purchase Voucher Stress Pack

This folder contains ordinary multi-document purchase packets for the Solution Nyx purchase-posting flow.
Each PDF normally contains a Purchase Order, Tax Invoice, Delivery Challan, Weighment Slip, and E-Way Bill.
The PDF pages intentionally contain no testing instructions or expected outcomes.

- `ground-truth.json` is the private scenario manifest.
- `tally-master-plan.json` lists the supplier ledgers that valid scenarios require.
- Scenario IDs are stored only in the manifest, not printed inside the invoices.
- Upload one complete PDF packet at a time.
- Long invoices, duplicate-page conditions, conflicting supporting documents, and the mixed-invoice packet contain additional pages.
- `mixed-invoices-28-07-2026.pdf` contains a normal packet plus a second invoice and its E-Way Bill.

The buyer identity used in valid documents is Solution Nyx, Maharashtra, GSTIN 27BBBBB0000B1Z5.

## Accounting contract under test

- Both HSN 7204 MS Scrap and HSN 72031000 Sponge Iron map to `M S Scrap & Sponge Iron` in Tally, using unit `MTS`.
- Maharashtra suppliers use `M.S. Scrap Purchase`; other states use `O.M.S. Scrap Purchase`.
- Freight is separate under `Transportation Inward @ 18.00%`, and taxable freight is included in the GST basis.
- Income-tax TDS 194Q is 0.10% of MS Scrap material value only.
- Transport TDS is 1% of freight only.
- GST-TDS is separate from 194Q: local scrap uses CGST TDS 1% plus SGST TDS 1%; interstate scrap uses IGST TDS 2%.
- The supplier invoice date remains source evidence. The Tally voucher date is chosen separately when posting.

## Scenario matrix

| ID | File | Expected | Purpose |
| --- | --- | --- | --- |
{matrix_rows}
"""
    (OUTPUT / "README.md").write_text(content, encoding="utf-8")

    suppliers: dict[str, dict[str, str]] = {}
    for inv in scenarios:
        if inv.create_supplier_in_tally:
            suppliers[inv.supplier.gstin] = {
                "name": inv.supplier.name,
                "gstin": inv.supplier.gstin,
                "state": inv.supplier.state,
                "state_code": inv.supplier.state_code,
                "address": inv.supplier.address,
                "parent": "Sundry Creditors",
            }
    tally_plan = {
        "company": BUYER,
        "supplier_ledgers": sorted(suppliers.values(), key=lambda entry: entry["name"]),
        "shared_masters": {
            "stock_items": ["M S Scrap & Sponge Iron"],
            "units": ["MTS"],
            "purchase_ledgers": [
                "M.S. Scrap Purchase",
                "O.M.S. Scrap Purchase",
            ],
            "tax_ledgers": ["Input ITC CGST 9%", "Input ITC SGST 9%", "Input ITC IGST 18%"],
            "charge_ledgers": ["Transportation Inward @ 18.00%"],
            "withholding_ledgers": [
                "TDS Payable @ 0.10% (194Q)",
                "Tds on Goods Transport",
                "CGST TDS PAYABLE 1%",
                "SGST TDS PAYABLE 1%",
                "IGST TDS PAYABLE 2%",
            ],
            "adjustment_ledgers": ["TCS Receivable", "Round Off"],
        },
        "do_not_create_for_blockers": ["Konkan Circular Metals"],
    }
    (OUTPUT / "tally-master-plan.json").write_text(
        json.dumps(tally_plan, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    if TMP.exists():
        shutil.rmtree(TMP)
    OUTPUT.mkdir(parents=True)
    TMP.mkdir(parents=True)

    scenarios = build_scenarios()
    for inv in scenarios:
        path = OUTPUT / inv.filename
        build_packet_pdf(path, inv)
        if inv.transform:
            transform_pdf(path, inv.transform)

    manifest = {
        "generated_on": date.today().isoformat(),
        "buyer": BUYER,
        "scenario_count": len(scenarios),
        "pdf_count": len(list(OUTPUT.glob("*.pdf"))),
        "scenarios": [serialise_invoice(inv) for inv in scenarios],
    }
    (OUTPUT / "ground-truth.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    write_readme(scenarios)
    print(json.dumps({"output": str(OUTPUT), "scenarios": len(scenarios)}, indent=2))


if __name__ == "__main__":
    main()
