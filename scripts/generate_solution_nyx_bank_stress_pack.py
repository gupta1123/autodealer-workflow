from __future__ import annotations

import hashlib
import html
import json
import math
import re
import shutil
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import fitz
from PIL import Image, ImageEnhance, ImageFilter
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = REPO_ROOT / "output" / "pdf" / "solution-nyx-resilient-bank-stress-pack"
TEMP_DIR = REPO_ROOT / "tmp" / "pdfs" / "solution-nyx-bank-stress-pack"
TALLY_URL = "http://localhost:9000"
COMPANY_NAME = "Solution Nyx"
BANK_NAME = "State Bank of India"
BANK_LEDGER = "State Bank of India - 42861007319"
ACCOUNT_NUMBER = "42861007319"
IFSC = "SBIN0000456"
PASSWORD = "Kalika123"
PAGE_SIZE = landscape(A4)


SPECS = [
    {"name": "01-solution-nyx-150-rows-8-pages.pdf", "rows": 150, "pages": 8, "kind": "text"},
    {"name": "02-solution-nyx-250-rows-15-pages.pdf", "rows": 250, "pages": 15, "kind": "text"},
    {"name": "03-solution-nyx-400-rows-25-pages.pdf", "rows": 400, "pages": 25, "kind": "text"},
    {"name": "04-solution-nyx-500-rows-30-pages.pdf", "rows": 500, "pages": 30, "kind": "text"},
    {"name": "05-solution-nyx-250-rows-15-pages-scanned.pdf", "rows": 250, "pages": 15, "kind": "scanned"},
    {"name": "06-solution-nyx-150-rows-10-pages-password.pdf", "rows": 150, "pages": 10, "kind": "password"},
]


def tally_collection(collection_name: str, tally_type: str, fetch_fields: str) -> str:
    body = (
        "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST>"
        f"<TYPE>Collection</TYPE><ID>{collection_name}</ID></HEADER><BODY><DESC>"
        "<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>"
        f"<SVCURRENTCOMPANY>{COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES>"
        f"<TDL><TDLMESSAGE><COLLECTION NAME=\"{collection_name}\" ISMODIFY=\"No\">"
        f"<TYPE>{tally_type}</TYPE><FETCH>{fetch_fields}</FETCH>"
        "</COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>"
    ).encode("utf-8")
    request = urllib.request.Request(
        TALLY_URL,
        data=body,
        headers={"Content-Type": "text/xml"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def blocks(xml: str, tag_name: str) -> list[str]:
    return re.findall(rf"<{tag_name}\b[\s\S]*?</{tag_name}>", xml, flags=re.IGNORECASE)


def attribute(block: str, name: str) -> str:
    match = re.search(rf'{name}\s*=\s*"([^"]*)"', block, flags=re.IGNORECASE)
    return html.unescape(match.group(1)).strip() if match else ""


def tag_text(block: str, name: str) -> str:
    match = re.search(rf"<{name}\b[^>]*>([\s\S]*?)</{name}>", block, flags=re.IGNORECASE)
    return html.unescape(match.group(1)).strip() if match else ""


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def fetch_live_ledgers() -> tuple[list[dict], list[dict]]:
    ledger_xml = tally_collection("Codex Stress Ledgers", "Ledger", "Name,Parent,IsBillWiseOn")
    group_xml = tally_collection("Codex Stress Groups", "Group", "Name,Parent")
    ledgers = [
        {
            "name": attribute(block, "NAME") or tag_text(block, "NAME"),
            "parent": tag_text(block, "PARENT"),
            "billwise": tag_text(block, "ISBILLWISEON").casefold() == "yes",
        }
        for block in blocks(ledger_xml, "LEDGER")
    ]
    groups = [
        {"name": attribute(block, "NAME") or tag_text(block, "NAME"), "parent": tag_text(block, "PARENT")}
        for block in blocks(group_xml, "GROUP")
    ]
    ledgers = [ledger for ledger in ledgers if ledger["name"]]
    if len(ledgers) < 500:
        raise RuntimeError(f"Expected the live 600-ledger Solution Nyx company; Tally returned only {len(ledgers)} ledgers.")
    return ledgers, groups


def is_descendant(parent_name: str, target: str, group_parent: dict[str, str]) -> bool:
    current = parent_name
    visited: set[str] = set()
    while current:
        key = normalize(current)
        if key == normalize(target):
            return True
        if key in visited:
            return False
        visited.add(key)
        current = group_parent.get(key, "")
    return False


def abbreviate(name: str) -> str:
    replacements = {
        "PRIVATE": "PVT",
        "LIMITED": "LTD",
        "STEEL": "STL",
        "STRUCTURAL": "STRCTRL",
        "ENGINEERING": "ENGG",
        "SUPPLIERS": "SUPPLRS",
        "CORPORATION": "CORP",
        "DISTRIBUTORS": "DIST",
        "INDUSTRIAL": "INDL",
        "TRADERS": "TRDRS",
    }
    words = []
    for word in name.upper().split():
        words.append(replacements.get(word, word))
    return " ".join(words)


def build_transactions(row_count: int, debtors: list[str], creditors: list[str], others: list[str], seed_offset: int) -> list[dict]:
    start = date(2026, 9, 1)
    opening_balance = 25_000_000.0 + seed_offset * 10_000
    balance = opening_balance
    rows = []
    modes = ["NEFT", "RTGS", "IMPS", "UPI"]
    for index in range(row_count):
        incoming = index % 5 in {0, 1, 3}
        if incoming:
            ledger = debtors[(index * 7 + seed_offset) % len(debtors)]
        elif index % 13 == 0 and others:
            ledger = others[(index * 5 + seed_offset) % len(others)]
        else:
            ledger = creditors[(index * 11 + seed_offset) % len(creditors)]
        displayed_name = abbreviate(ledger) if index % 11 == 5 else ledger.upper()
        mode = modes[(index + seed_offset) % len(modes)]
        amount = float(5_000 + ((index * 7_913 + seed_offset * 977) % 245_000))
        if incoming:
            debit, credit = None, amount
            balance += amount
            narration = f"{mode} CR FROM {displayed_name}"
        else:
            debit, credit = amount, None
            balance -= amount
            narration = f"{mode} DR TO {displayed_name}"
        transaction_date = start + timedelta(days=(index // 20) % 28)
        reference = f"SBS{seed_offset:02d}{transaction_date:%d%m}{index + 1:05d}"
        rows.append(
            {
                "date": transaction_date.isoformat(),
                "dateLabel": transaction_date.strftime("%d %b %Y"),
                "description": narration,
                "reference": reference,
                "debit": debit,
                "credit": credit,
                "balance": round(balance, 2),
                "expectedLedger": ledger,
            }
        )
    return rows


def distribute(total: int, pages: int) -> list[int]:
    base, extra = divmod(total, pages)
    return [base + (1 if index < extra else 0) for index in range(pages)]


def fit_text(value: str, max_width: float, font_name: str = "Helvetica", font_size: float = 7.2) -> str:
    value = str(value)
    if stringWidth(value, font_name, font_size) <= max_width:
        return value
    suffix = "..."
    while value and stringWidth(value + suffix, font_name, font_size) > max_width:
        value = value[:-1]
    return value + suffix


def money(value: float | None) -> str:
    return "-" if value is None else f"{value:,.2f}"


def draw_statement(path: Path, rows: list[dict], page_count: int, title_suffix: str = "") -> None:
    width, height = PAGE_SIZE
    pdf = canvas.Canvas(str(path), pagesize=PAGE_SIZE, pageCompression=1)
    counts = distribute(len(rows), page_count)
    row_cursor = 0
    statement_start = rows[0]["dateLabel"]
    statement_end = rows[-1]["dateLabel"]
    for page_index, rows_on_page in enumerate(counts, start=1):
        pdf.setFillColor(colors.HexColor("#101828"))
        pdf.rect(0, height - 62, width, 62, fill=1, stroke=0)
        pdf.setFillColor(colors.white)
        pdf.setFont("Helvetica-Bold", 15)
        pdf.drawString(28, height - 28, f"{BANK_NAME} - Current Account Statement{title_suffix}")
        pdf.setFont("Helvetica", 8)
        pdf.drawString(28, height - 45, f"Account holder: {COMPANY_NAME}   Account: {ACCOUNT_NUMBER}   IFSC: {IFSC}")
        pdf.drawRightString(width - 28, height - 45, f"Page {page_index} of {page_count}")

        pdf.setFillColor(colors.HexColor("#344054"))
        pdf.setFont("Helvetica", 8)
        pdf.drawString(28, height - 80, f"Statement period: {statement_start} to {statement_end}")
        pdf.drawRightString(width - 28, height - 80, "Currency: INR")

        x_positions = [28, 88, 376, 486, 566, 646, 742]
        header_y = height - 103
        pdf.setFillColor(colors.HexColor("#EAF2F8"))
        pdf.rect(28, header_y - 15, width - 56, 20, fill=1, stroke=0)
        pdf.setFillColor(colors.HexColor("#344054"))
        pdf.setFont("Helvetica-Bold", 7)
        for x, label in zip(x_positions, ["DATE", "NARRATION", "REFERENCE", "DEBIT", "CREDIT", "BALANCE"]):
            pdf.drawString(x + 3, header_y - 8, label)

        available_height = header_y - 38
        row_height = min(23.0, available_height / max(1, rows_on_page))
        y = header_y - 25
        page_rows = rows[row_cursor : row_cursor + rows_on_page]
        for local_index, row in enumerate(page_rows):
            if local_index % 2 == 1:
                pdf.setFillColor(colors.HexColor("#F8FAFC"))
                pdf.rect(28, y - row_height + 4, width - 56, row_height, fill=1, stroke=0)
            pdf.setFillColor(colors.HexColor("#101828"))
            pdf.setFont("Helvetica", 7.2)
            pdf.drawString(x_positions[0] + 3, y - 8, row["dateLabel"])
            pdf.drawString(x_positions[1] + 3, y - 8, fit_text(row["description"], 280))
            pdf.drawString(x_positions[2] + 3, y - 8, fit_text(row["reference"], 102))
            pdf.drawRightString(x_positions[4] - 5, y - 8, money(row["debit"]))
            pdf.drawRightString(x_positions[5] - 5, y - 8, money(row["credit"]))
            pdf.drawRightString(width - 31, y - 8, money(row["balance"]))
            pdf.setStrokeColor(colors.HexColor("#EAECF0"))
            pdf.line(28, y - row_height + 4, width - 28, y - row_height + 4)
            y -= row_height
        row_cursor += rows_on_page

        pdf.setFillColor(colors.HexColor("#667085"))
        pdf.setFont("Helvetica", 7)
        pdf.drawString(28, 14, "Computer-generated statement fixture for reconciliation testing. No posting instruction is implied.")
        pdf.drawRightString(width - 28, 14, f"Rows on page: {rows_on_page}")
        pdf.showPage()
    pdf.save()


def make_scanned(source_path: Path, target_path: Path) -> None:
    source = fitz.open(source_path)
    width, height = PAGE_SIZE
    target = canvas.Canvas(str(target_path), pagesize=PAGE_SIZE, pageCompression=1)
    scan_dir = TEMP_DIR / "scan-pages"
    scan_dir.mkdir(parents=True, exist_ok=True)
    for index, page in enumerate(source):
        pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), colorspace=fitz.csGRAY, alpha=False)
        image = Image.frombytes("L", (pix.width, pix.height), pix.samples)
        image = ImageEnhance.Contrast(image).enhance(1.08)
        noise = Image.effect_noise(image.size, 6.0)
        image = Image.blend(image, noise, 0.035).filter(ImageFilter.GaussianBlur(0.08))
        image = ImageEnhance.Contrast(image).enhance(1.06)
        image_path = scan_dir / f"page-{index + 1:03d}.jpg"
        image.save(image_path, "JPEG", quality=92, optimize=False)
        target.drawImage(ImageReader(str(image_path)), 0, 0, width=width, height=height, preserveAspectRatio=False)
        target.showPage()
    target.save()
    source.close()


def encrypt_pdf(source_path: Path, target_path: Path, password: str) -> None:
    reader = PdfReader(str(source_path))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.add_metadata({"/Title": "Solution Nyx password-protected bank statement stress fixture"})
    writer.encrypt(password, algorithm="AES-256")
    with target_path.open("wb") as output:
        writer.write(output)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_pdf(path: Path, expected_pages: int, expected_rows: int, password: str | None = None) -> dict:
    reader = PdfReader(str(path))
    encrypted = reader.is_encrypted
    if password:
        if not encrypted or not reader.decrypt(password):
            raise RuntimeError(f"{path.name} is not encrypted with the expected password.")
    elif encrypted:
        raise RuntimeError(f"{path.name} was unexpectedly encrypted.")
    if len(reader.pages) != expected_pages:
        raise RuntimeError(f"{path.name}: expected {expected_pages} pages, found {len(reader.pages)}.")
    extracted_text = "\n".join((page.extract_text() or "") for page in reader.pages)
    extracted_reference_values = re.findall(r"\bSBS\d{11}\b", extracted_text)
    extracted_refs = len(extracted_reference_values)
    if "scanned" not in path.name and extracted_refs != expected_rows:
        raise RuntimeError(f"{path.name}: expected {expected_rows} extractable transaction references, found {extracted_refs}.")
    if "scanned" not in path.name and len(set(extracted_reference_values)) != expected_rows:
        raise RuntimeError(
            f"{path.name}: expected {expected_rows} unique transaction references, "
            f"found {len(set(extracted_reference_values))}."
        )
    return {
        "fileName": path.name,
        "bytes": path.stat().st_size,
        "megabytes": round(path.stat().st_size / (1024 * 1024), 3),
        "pages": len(reader.pages),
        "rows": expected_rows,
        "encrypted": encrypted,
        "extractableReferenceCount": extracted_refs,
        "sha256": sha256(path),
    }


def main() -> None:
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    ledgers, groups = fetch_live_ledgers()
    group_parent = {normalize(group["name"]): group["parent"] for group in groups}
    debtors = sorted(ledger["name"] for ledger in ledgers if is_descendant(ledger["parent"], "Sundry Debtors", group_parent))
    creditors = sorted(ledger["name"] for ledger in ledgers if is_descendant(ledger["parent"], "Sundry Creditors", group_parent))
    excluded_groups = {"sundry debtors", "sundry creditors", "bank accounts"}
    others = sorted(
        ledger["name"]
        for ledger in ledgers
        if ledger["name"] != BANK_LEDGER
        and not any(is_descendant(ledger["parent"], target, group_parent) for target in excluded_groups)
    )
    if not debtors or not creditors:
        raise RuntimeError("Could not resolve debtor and creditor subgroup ledgers from live Tally data.")

    transaction_manifests = {}
    validations = []
    for spec_index, spec in enumerate(SPECS, start=1):
        rows = build_transactions(spec["rows"], debtors, creditors, others, spec_index)
        transaction_manifests[spec["name"]] = rows
        target = OUTPUT_DIR / spec["name"]
        if spec["kind"] == "scanned":
            source = TEMP_DIR / "scanned-source.pdf"
            draw_statement(source, rows, spec["pages"], " - Scanned Fixture")
            make_scanned(source, target)
        elif spec["kind"] == "password":
            source = TEMP_DIR / "password-source.pdf"
            draw_statement(source, rows, spec["pages"], " - Protected Fixture")
            encrypt_pdf(source, target, PASSWORD)
        else:
            draw_statement(target, rows, spec["pages"])
        validations.append(
            validate_pdf(
                target,
                spec["pages"],
                spec["rows"],
                PASSWORD if spec["kind"] == "password" else None,
            )
        )

    manifest = {
        "pack": "Solution Nyx resilient bank statement stress pack",
        "generatedFromLiveTallyCompany": COMPANY_NAME,
        "liveLedgerCount": len(ledgers),
        "debtorLedgerCountIncludingSubgroups": len(debtors),
        "creditorLedgerCountIncludingSubgroups": len(creditors),
        "bankLedger": BANK_LEDGER,
        "passwordForProtectedFixture": PASSWORD,
        "files": validations,
        "expectedTransactions": transaction_manifests,
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    readme_lines = [
        "# Solution Nyx resilient bank statement stress pack",
        "",
        f"Generated read-only from the live `{COMPANY_NAME}` Tally company with {len(ledgers)} ledgers.",
        f"Protected PDF password: `{PASSWORD}`.",
        "",
        "Do not post these fixtures to Tally during extraction and matching performance tests.",
        "",
        "## Files",
        "",
    ]
    for item in validations:
        readme_lines.append(
            f"- `{item['fileName']}` - {item['rows']} rows, {item['pages']} pages, {item['megabytes']} MB"
        )
    (OUTPUT_DIR / "README.md").write_text("\n".join(readme_lines) + "\n", encoding="utf-8")
    shutil.rmtree(TEMP_DIR, ignore_errors=True)
    print(json.dumps({"outputDir": str(OUTPUT_DIR), "files": validations}, indent=2))


if __name__ == "__main__":
    main()
