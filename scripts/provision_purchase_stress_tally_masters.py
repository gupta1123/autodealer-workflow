from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "output" / "pdf" / "purchase-voucher-stress-pack" / "tally-master-plan.json"
TALLY_URL = "http://127.0.0.1:9000"
COMPANY = "Solution Nyx"
GST_STATE_BY_CODE = {
    "19": "West Bengal",
    "24": "Gujarat",
    "27": "Maharashtra",
    "29": "Karnataka",
}


def post_xml(payload: str) -> str:
    request = urllib.request.Request(
        TALLY_URL,
        data=payload.encode("utf-8"),
        headers={"Content-Type": "text/xml; charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def clean_tally_xml(value: str) -> str:
    return re.sub(
        r"&#(?:x0*([0-8BCEF])|0*(?:[0-8]|11|12|14|15));",
        "",
        value,
        flags=re.IGNORECASE,
    )


def export_ledgers() -> list[dict[str, str]]:
    collection_name = "Codex Purchase Stress Ledger Inventory"
    payload = f"""
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>{collection_name}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>{escape(COMPANY)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="{collection_name}" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <FETCH>Name,Parent,PartyGSTIN,StateName,TaxType,GSTDutyHead,RateOfTaxCalculation</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
"""
    root = ET.fromstring(clean_tally_xml(post_xml(payload)))
    ledgers: list[dict[str, str]] = []
    for node in root.iter("LEDGER"):
        name = node.attrib.get("NAME") or node.findtext("NAME") or ""
        if not name:
            continue
        gstin = (node.findtext("PARTYGSTIN") or "").replace(" ", "").upper()
        returned_state = node.findtext("STATENAME") or ""
        ledgers.append(
            {
                "name": name,
                "parent": node.findtext("PARENT") or "",
                "gstin": gstin,
                # Some TallyPrime releases do not expose a separate party-state field
                # for GST ledgers. The first two GSTIN digits are authoritative.
                "state": returned_state or GST_STATE_BY_CODE.get(gstin[:2], ""),
                "tax_type": node.findtext("TAXTYPE") or "",
                "duty_head": node.findtext("GSTDUTYHEAD") or "",
                "rate": (node.findtext("RATEOFTAXCALCULATION") or "").strip(),
            }
        )
    return ledgers


def import_ledger(ledger_xml: str) -> dict[str, str | int]:
    payload = f"""
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>All Masters</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>{escape(COMPANY)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        {ledger_xml}
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>
"""
    response = post_xml(payload)

    def count(tag: str) -> int:
        match = re.search(rf"<{tag}>(-?\d+)</{tag}>", response, re.IGNORECASE)
        return int(match.group(1)) if match else 0

    error_match = re.search(r"<LINEERROR>(.*?)</LINEERROR>", response, re.IGNORECASE | re.DOTALL)
    result: dict[str, str | int] = {
        "created": count("CREATED"),
        "altered": count("ALTERED"),
        "errors": count("ERRORS"),
        "exceptions": count("EXCEPTIONS"),
        "line_error": re.sub(r"\s+", " ", error_match.group(1)).strip() if error_match else "",
    }
    if result["errors"] or result["exceptions"] or result["line_error"]:
        raise RuntimeError(json.dumps(result))
    if not result["created"] and not result["altered"]:
        raise RuntimeError(f"Tally did not confirm a master change: {response[:500]}")
    return result


def party_ledger_xml(entry: dict[str, str], action: str = "Create") -> str:
    name = escape(entry["name"])
    address = escape(entry["address"])
    return f"""
<LEDGER NAME="{name}" ACTION="{escape(action)}">
  <NAME.LIST TYPE="String"><NAME>{name}</NAME></NAME.LIST>
  <PARENT>Sundry Creditors</PARENT>
  <ISBILLWISEON>Yes</ISBILLWISEON>
  <AFFECTSSTOCK>No</AFFECTSSTOCK>
  <COUNTRYOFRESIDENCE>India</COUNTRYOFRESIDENCE>
  <STATENAME>{escape(entry["state"])}</STATENAME>
  <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>
  <PARTYGSTIN>{escape(entry["gstin"])}</PARTYGSTIN>
  <ADDRESS.LIST TYPE="String"><ADDRESS>{address}</ADDRESS></ADDRESS.LIST>
</LEDGER>
"""


def tax_ledger_xml(name: str, duty_head: str, rate: str) -> str:
    escaped_name = escape(name)
    return f"""
<LEDGER NAME="{escaped_name}" ACTION="Create">
  <NAME.LIST TYPE="String"><NAME>{escaped_name}</NAME></NAME.LIST>
  <PARENT>Duties &amp; Taxes</PARENT>
  <TAXTYPE>GST</TAXTYPE>
  <GSTDUTYHEAD>{escape(duty_head)}</GSTDUTYHEAD>
  <RATEOFTAXCALCULATION>{escape(rate)}</RATEOFTAXCALCULATION>
  <ISGSTAPPLICABLE>Applicable</ISGSTAPPLICABLE>
</LEDGER>
"""


def ordinary_ledger_xml(name: str, parent: str) -> str:
    escaped_name = escape(name)
    return f"""
<LEDGER NAME="{escaped_name}" ACTION="Create">
  <NAME.LIST TYPE="String"><NAME>{escaped_name}</NAME></NAME.LIST>
  <PARENT>{escape(parent)}</PARENT>
  <TAXTYPE>Others</TAXTYPE>
  <RATEOFTAXCALCULATION>0</RATEOFTAXCALCULATION>
</LEDGER>
"""


def main() -> None:
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    before = export_ledgers()
    by_name = {row["name"].casefold(): row for row in before}
    actions: list[dict[str, object]] = []

    for supplier in plan["supplier_ledgers"]:
        existing = by_name.get(supplier["name"].casefold())
        if existing:
            if existing["parent"].casefold() != "sundry creditors":
                raise RuntimeError(
                    f"{supplier['name']} exists under {existing['parent']}, not Sundry Creditors"
                )
            if existing["gstin"].replace(" ", "").upper() != supplier["gstin"].upper():
                raise RuntimeError(
                    f"{supplier['name']} exists with GSTIN {existing['gstin']!r}, "
                    f"not {supplier['gstin']}"
                )
            if not existing["state"]:
                result = import_ledger(party_ledger_xml(supplier, action="Alter"))
                actions.append(
                    {"name": supplier["name"], "action": "completed_party_details", "result": result}
                )
                continue
            if existing["state"].casefold() != supplier["state"].casefold():
                raise RuntimeError(
                    f"{supplier['name']} exists with state {existing['state']!r}, "
                    f"not {supplier['state']}"
                )
            actions.append({"name": supplier["name"], "action": "already_present"})
            continue
        result = import_ledger(party_ledger_xml(supplier))
        actions.append({"name": supplier["name"], "action": "created", "result": result})

    required_shared = [
        (
            "Sponge Iron Purchase",
            ordinary_ledger_xml("Sponge Iron Purchase", "Purchase Accounts"),
        ),
        (
            "Input IGST 18%",
            tax_ledger_xml("Input IGST 18%", "IGST", "18"),
        ),
        (
            "TCS Receivable",
            ordinary_ledger_xml("TCS Receivable", "Duties & Taxes"),
        ),
        (
            "Round Off",
            ordinary_ledger_xml("Round Off", "Indirect Expenses"),
        ),
    ]
    for name, xml in required_shared:
        existing = by_name.get(name.casefold())
        if existing:
            actions.append({"name": name, "action": "already_present"})
            continue
        result = import_ledger(xml)
        actions.append({"name": name, "action": "created", "result": result})

    after = export_ledgers()
    after_by_name = {row["name"].casefold(): row for row in after}
    required_names = [entry["name"] for entry in plan["supplier_ledgers"]] + [
        "Sponge Iron Purchase",
        "Input IGST 18%",
        "TCS Receivable",
        "Round Off",
    ]
    missing = [name for name in required_names if name.casefold() not in after_by_name]
    if missing:
        raise RuntimeError(f"Missing after provisioning: {missing}")

    verified = [after_by_name[name.casefold()] for name in required_names]
    if "konkan circular metals" in after_by_name:
        raise RuntimeError("Konkan Circular Metals must remain absent for blocker coverage")

    print(
        json.dumps(
            {
                "company": COMPANY,
                "actions": actions,
                "verified": verified,
                "deliberately_absent": ["Konkan Circular Metals"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
