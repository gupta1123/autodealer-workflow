#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BRIDGE_VERSION = "0.1.8";
const DEFAULT_TALLY_URL = "http://localhost:9000";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const TALLY_IMPORT_TIMEOUT_MS = 30_000;
const CONFIG_DIR = path.join(os.homedir(), ".autodealer-tally-bridge");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith("--")) {
      continue;
    }

    const key = entry.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function required(value, name) {
  if (!value) {
    throw new Error(`Missing required argument: --${name}`);
  }

  return value;
}

function normalizeBaseUrl(value) {
  return required(value, "api-base").replace(/\/+$/, "");
}

function normalizeTallyUrl(value) {
  return (value || DEFAULT_TALLY_URL).replace(/\/+$/, "");
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function formatCliError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause;
  if (cause instanceof Error) {
    const code = typeof cause.code === "string" ? ` (${cause.code})` : "";
    return `${error.message}: ${cause.message}${code}`;
  }

  return error.message;
}

function writeConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function createMachineId() {
  return `${os.hostname()}-${os.platform()}-${os.arch()}`;
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || `HTTP ${response.status}` };
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodeXmlEntities(value) {
  let decoded = String(value ?? "");
  for (let index = 0; index < 3; index += 1) {
    const next = decoded
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
        const parsed = Number.parseInt(code, 16);
        return Number.isFinite(parsed) && parsed >= 32 ? String.fromCodePoint(parsed) : " ";
      })
      .replace(/&#(\d+);/g, (_, code) => {
        const parsed = Number.parseInt(code, 10);
        return Number.isFinite(parsed) && parsed >= 32 ? String.fromCodePoint(parsed) : " ";
      })
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'");
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function cleanXmlText(value) {
  return decodeXmlEntities(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTagText(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? cleanXmlText(match[1]) : null;
}

function getAttribute(block, attributeName) {
  const match = block.match(new RegExp(`\\b${attributeName}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? cleanXmlText(match[1]) : null;
}

function extractBlocks(xml, tagName) {
  const blocks = [];
  const regex = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi");
  let match = regex.exec(xml);

  while (match) {
    blocks.push(match[0]);
    match = regex.exec(xml);
  }

  return blocks;
}

function buildTallyReadinessXml(companyName) {
  const companyVariable = companyName
    ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : "";

  return [
    "<ENVELOPE>",
    "<HEADER>",
    "<VERSION>1</VERSION>",
    "<TALLYREQUEST>Export</TALLYREQUEST>",
    "<TYPE>Collection</TYPE>",
    "<ID>Autodealer Ledgers Probe</ID>",
    "</HEADER>",
    "<BODY>",
    "<DESC>",
    "<STATICVARIABLES>",
    companyVariable,
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>",
    "</STATICVARIABLES>",
    "<TDL>",
    "<TDLMESSAGE>",
    '<COLLECTION NAME="Autodealer Ledgers Probe" ISMODIFY="No">',
    "<TYPE>Ledger</TYPE>",
    "<FETCH>Name,Parent,GUID</FETCH>",
    "</COLLECTION>",
    "</TDLMESSAGE>",
    "</TDL>",
    "</DESC>",
    "</BODY>",
    "</ENVELOPE>",
  ].join("");
}

function buildCollectionExportXml({ collectionName, tallyType, fetchFields, companyName }) {
  const companyVariable = companyName
    ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : "";

  return [
    "<ENVELOPE>",
    "<HEADER>",
    "<VERSION>1</VERSION>",
    "<TALLYREQUEST>Export</TALLYREQUEST>",
    "<TYPE>Collection</TYPE>",
    `<ID>${escapeXml(collectionName)}</ID>`,
    "</HEADER>",
    "<BODY>",
    "<DESC>",
    "<STATICVARIABLES>",
    companyVariable,
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>",
    "</STATICVARIABLES>",
    "<TDL>",
    "<TDLMESSAGE>",
    `<COLLECTION NAME="${escapeXml(collectionName)}" ISMODIFY="No">`,
    `<TYPE>${escapeXml(tallyType)}</TYPE>`,
    `<FETCH>${escapeXml(fetchFields)}</FETCH>`,
    "</COLLECTION>",
    "</TDLMESSAGE>",
    "</TDL>",
    "</DESC>",
    "</BODY>",
    "</ENVELOPE>",
  ].join("");
}

function buildAlterLedgerXml(payload, fallbackCompanyName) {
  const oldName = payload?.oldName;
  const newName = payload?.newName;
  const parentName = payload?.parentName;
  const companyName = payload?.companyName || fallbackCompanyName;

  if (!oldName || !newName) {
    throw new Error("Ledger edit command is missing oldName or newName.");
  }

  const companyVariable = companyName
    ? `<SVCurrentCompany>${escapeXml(companyName)}</SVCurrentCompany>`
    : "";
  const parentBlock = parentName ? `<PARENT>${escapeXml(parentName)}</PARENT>` : "";

  return [
    "<ENVELOPE>",
    "<HEADER>",
    "<TALLYREQUEST>Import Data</TALLYREQUEST>",
    "</HEADER>",
    "<BODY>",
    "<IMPORTDATA>",
    "<REQUESTDESC>",
    "<REPORTNAME>All Masters</REPORTNAME>",
    "<STATICVARIABLES>",
    companyVariable,
    "</STATICVARIABLES>",
    "</REQUESTDESC>",
    "<REQUESTDATA>",
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<LEDGER NAME="${escapeXml(oldName)}" ACTION="Alter">`,
    `<NAME>${escapeXml(newName)}</NAME>`,
    parentBlock,
    "<LANGUAGENAME.LIST>",
    '<NAME.LIST TYPE="String">',
    `<NAME>${escapeXml(newName)}</NAME>`,
    "</NAME.LIST>",
    '<LANGUAGEID TYPE="Number">1033</LANGUAGEID>',
    "</LANGUAGENAME.LIST>",
    "</LEDGER>",
    "</TALLYMESSAGE>",
    "</REQUESTDATA>",
    "</IMPORTDATA>",
    "</BODY>",
    "</ENVELOPE>",
  ].join("");
}

function buildCreateLedgerXml(payload, fallbackCompanyName) {
  const name = String(payload?.name || "").trim();
  const parentName = String(payload?.parentName || "").trim();
  const companyName = payload?.companyName || fallbackCompanyName;

  if (!name || !parentName) {
    throw new Error("Ledger create command is missing name or parentName.");
  }

  const companyVariable = companyName
    ? `<SVCurrentCompany>${escapeXml(companyName)}</SVCurrentCompany>`
    : "";

  return [
    "<ENVELOPE>",
    "<HEADER>",
    "<TALLYREQUEST>Import Data</TALLYREQUEST>",
    "</HEADER>",
    "<BODY>",
    "<IMPORTDATA>",
    "<REQUESTDESC>",
    "<REPORTNAME>All Masters</REPORTNAME>",
    "<STATICVARIABLES>",
    companyVariable,
    "</STATICVARIABLES>",
    "</REQUESTDESC>",
    "<REQUESTDATA>",
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<LEDGER NAME="${escapeXml(name)}" ACTION="Create">`,
    `<NAME>${escapeXml(name)}</NAME>`,
    `<PARENT>${escapeXml(parentName)}</PARENT>`,
    "<ISBILLWISEON>No</ISBILLWISEON>",
    "<AFFECTSSTOCK>No</AFFECTSSTOCK>",
    "<LANGUAGENAME.LIST>",
    '<NAME.LIST TYPE="String">',
    `<NAME>${escapeXml(name)}</NAME>`,
    "</NAME.LIST>",
    '<LANGUAGEID TYPE="Number">1033</LANGUAGEID>',
    "</LANGUAGENAME.LIST>",
    "</LEDGER>",
    "</TALLYMESSAGE>",
    "</REQUESTDATA>",
    "</IMPORTDATA>",
    "</BODY>",
    "</ENVELOPE>",
  ].join("");
}

function toIsoLikeDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}${match[2]}${match[3]}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Bank voucher command is missing a valid voucher date.");
  }
  return parsed.toISOString().slice(0, 10).replaceAll("-", "");
}

function toDisplayDate(value) {
  const date = toIsoLikeDate(value);
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function isLikelyEducationalModeDateRestriction(voucherDate, error) {
  if (!/voucher date is missing/i.test(String(error || ""))) return false;
  const date = toIsoLikeDate(voucherDate);
  const day = date.slice(6, 8);
  return day !== "01" && day !== "02" && day !== "31";
}

function explainBankVoucherTallyError(outcome, payload) {
  if (!outcome?.success && isLikelyEducationalModeDateRestriction(payload?.voucherDate, outcome?.error)) {
    const displayDate = toDisplayDate(payload.voucherDate);
    return {
      ...outcome,
      error:
        `${outcome.error} This matches Tally Educational Mode date restrictions: imports are accepted only on allowed dates such as the 1st, 2nd, and 31st. ` +
        `The voucher date ${displayDate} is blocked by Tally, not missing from the XML. Activate licensed Tally or test with an allowed date.`,
      result: {
        ...(outcome.result || {}),
        diagnosedReason: "tally_educational_mode_date_restriction",
        voucherDate: displayDate,
      },
    };
  }

  return outcome;
}

function toMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Bank voucher command is missing a positive amount.");
  }
  return parsed.toFixed(2);
}

function buildBankAllocationXml({ voucherDate, referenceNumber, amount, isDebit }) {
  const signedAmount = isDebit ? `-${amount}` : amount;
  const escapedReferenceNumber = escapeXml(referenceNumber);

  return [
    "<BANKALLOCATIONS.LIST>",
    `<DATE>${voucherDate}</DATE>`,
    `<INSTRUMENTDATE>${voucherDate}</INSTRUMENTDATE>`,
    escapedReferenceNumber ? `<NAME>${escapedReferenceNumber}</NAME>` : "",
    escapedReferenceNumber ? `<INSTRUMENTNUMBER>${escapedReferenceNumber}</INSTRUMENTNUMBER>` : "",
    "<TRANSACTIONTYPE>Others</TRANSACTIONTYPE>",
    `<AMOUNT>${signedAmount}</AMOUNT>`,
    "</BANKALLOCATIONS.LIST>",
  ].join("");
}

function normalizeBillAllocationType(value) {
  return String(value || "").trim().toLowerCase() === "advance" ? "Advance" : "Agst Ref";
}

function buildBillAllocationsXml({ allocations, isDebit }) {
  if (!Array.isArray(allocations) || allocations.length === 0) return "";
  return allocations
    .map((allocation) => {
      const referenceName = String(allocation?.referenceName || "").trim();
      const amount = Number(allocation?.amount);
      if (!referenceName || !Number.isFinite(amount) || amount <= 0) return "";
      const signedAmount = isDebit ? `-${amount.toFixed(2)}` : amount.toFixed(2);
      return [
        "<BILLALLOCATIONS.LIST>",
        `<NAME>${escapeXml(referenceName)}</NAME>`,
        `<BILLTYPE>${normalizeBillAllocationType(allocation?.referenceType)}</BILLTYPE>`,
        `<AMOUNT>${signedAmount}</AMOUNT>`,
        "</BILLALLOCATIONS.LIST>",
      ].join("");
    })
    .join("");
}

function buildLedgerEntryXml({
  ledgerName,
  amount,
  isDebit,
  isPartyLedger = false,
  bankAllocation = null,
  billAllocations = null,
}) {
  const signedAmount = isDebit ? `-${amount}` : amount;
  return [
    "<ALLLEDGERENTRIES.LIST>",
    `<LEDGERNAME>${escapeXml(ledgerName)}</LEDGERNAME>`,
    `<ISPARTYLEDGER>${isPartyLedger ? "Yes" : "No"}</ISPARTYLEDGER>`,
    "<REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>",
    `<ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    `<AMOUNT>${signedAmount}</AMOUNT>`,
    billAllocations || "",
    bankAllocation || "",
    "</ALLLEDGERENTRIES.LIST>",
  ].join("");
}

function buildVoucherMessageXml({
  voucherDate,
  voucherType,
  referenceNumber,
  narration,
  entries,
  partyLedgerName = null,
}) {
  const escapedReferenceNumber = escapeXml(referenceNumber);
  const voucherReferenceBlock = referenceNumber
    ? [
        `<VOUCHERNUMBER>${escapedReferenceNumber}</VOUCHERNUMBER>`,
        `<REFERENCE>${escapedReferenceNumber}</REFERENCE>`,
      ].join("")
    : "";
  const partyLedgerBlock = partyLedgerName
    ? `<PARTYLEDGERNAME>${escapeXml(partyLedgerName)}</PARTYLEDGERNAME>`
    : "";

  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<VOUCHER VCHTYPE="${escapeXml(voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    `<DATE>${voucherDate}</DATE>`,
    `<EFFECTIVEDATE>${voucherDate}</EFFECTIVEDATE>`,
    `<VOUCHERTYPENAME>${escapeXml(voucherType)}</VOUCHERTYPENAME>`,
    voucherReferenceBlock,
    `<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>`,
    "<ISINVOICE>No</ISINVOICE>",
    "<ISOPTIONAL>No</ISOPTIONAL>",
    "<DIFFACTUALQTY>No</DIFFACTUALQTY>",
    "<FORJOBCOSTING>No</FORJOBCOSTING>",
    partyLedgerBlock,
    `<NARRATION>${escapeXml(narration)}</NARRATION>`,
    ...entries,
    "</VOUCHER>",
    "</TALLYMESSAGE>",
  ].join("");
}

function buildCustomerAdvanceAdjustmentXml(payload, fallbackCompanyName) {
  const companyName = payload?.companyName || fallbackCompanyName;
  const voucherDate = toIsoLikeDate(payload?.voucherDate);
  const ledgerName = String(payload?.ledgerName || "").trim();
  const referenceNumber = String(payload?.referenceNumber || "").trim();
  const narration = String(payload?.narration || `Adjust customer advance ${referenceNumber}`).trim();
  const adjustments = Array.isArray(payload?.adjustments) ? payload.adjustments : [];

  if (!ledgerName) {
    throw new Error("Customer advance adjustment requires ledgerName.");
  }

  const normalizedAdjustments = adjustments.flatMap((adjustment) => {
    const advanceReferenceName = String(adjustment?.advanceReferenceName || "").trim();
    const billReferenceName = String(adjustment?.billReferenceName || "").trim();
    const amount = Number(adjustment?.amount);
    if (!advanceReferenceName || !billReferenceName || !Number.isFinite(amount) || amount <= 0) return [];
    return [{ advanceReferenceName, billReferenceName, amount: amount.toFixed(2) }];
  });

  if (normalizedAdjustments.length === 0) {
    throw new Error("Customer advance adjustment requires at least one valid adjustment line.");
  }

  const totalAmount = normalizedAdjustments
    .reduce((sum, adjustment) => sum + Number(adjustment.amount), 0)
    .toFixed(2);
  const advanceBillAllocations = normalizedAdjustments
    .map((adjustment) =>
      buildBillAllocationsXml({
        allocations: [
          {
            referenceType: "Advance",
            referenceName: adjustment.advanceReferenceName,
            amount: adjustment.amount,
          },
        ],
        isDebit: true,
      })
    )
    .join("");
  const billAllocations = normalizedAdjustments
    .map((adjustment) =>
      buildBillAllocationsXml({
        allocations: [
          {
            referenceType: "Agst Ref",
            referenceName: adjustment.billReferenceName,
            amount: adjustment.amount,
          },
        ],
        isDebit: false,
      })
    )
    .join("");

  const message = buildVoucherMessageXml({
    voucherDate,
    voucherType: "Journal",
    referenceNumber,
    narration,
    partyLedgerName: ledgerName,
    entries: [
      buildLedgerEntryXml({
        ledgerName,
        amount: totalAmount,
        isDebit: true,
        isPartyLedger: true,
        billAllocations: advanceBillAllocations,
      }),
      buildLedgerEntryXml({
        ledgerName,
        amount: totalAmount,
        isDebit: false,
        isPartyLedger: true,
        billAllocations,
      }),
    ],
  });

  return wrapVoucherMessagesXml({
    companyName,
    voucherDate,
    messages: [message],
  });
}

function wrapVoucherMessagesXml({ companyName, voucherDate, messages, legacyHeader = false }) {
  const staticVariables = [
    companyName ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>` : "",
    `<SVFROMDATE>${voucherDate}</SVFROMDATE>`,
    `<SVTODATE>${voucherDate}</SVTODATE>`,
    `<SVCURRENTDATE>${voucherDate}</SVCURRENTDATE>`,
  ].filter(Boolean);
  const header = legacyHeader
    ? [
        "<HEADER>",
        "<VERSION>1</VERSION>",
        "<TALLYREQUEST>Import Data</TALLYREQUEST>",
        "<TYPE>Data</TYPE>",
        "<ID>Vouchers</ID>",
        "</HEADER>",
      ]
    : [
        "<HEADER>",
        "<TALLYREQUEST>Import Data</TALLYREQUEST>",
        "</HEADER>",
      ];

  return [
    "<ENVELOPE>",
    ...header,
    "<BODY>",
    "<IMPORTDATA>",
    "<REQUESTDESC>",
    "<REPORTNAME>Vouchers</REPORTNAME>",
    "<STATICVARIABLES>",
    ...staticVariables,
    "</STATICVARIABLES>",
    "</REQUESTDESC>",
    "<REQUESTDATA>",
    ...messages,
    "</REQUESTDATA>",
    "</IMPORTDATA>",
    "</BODY>",
    "</ENVELOPE>",
  ].join("");
}

function buildBankVoucherXml(payload, fallbackCompanyName, options = {}) {
  const companyName = payload?.companyName || fallbackCompanyName;
  const voucherType = payload?.voucherType || "Payment";
  const voucherDate = toIsoLikeDate(payload?.voucherDate);
  const bankLedgerName = String(payload?.bankLedgerName || "").trim();
  const counterpartyLedgerName = String(payload?.counterpartyLedgerName || "").trim();
  const counterpartyIsPartyLedger = payload?.counterpartyIsPartyLedger === true;
  const bankLedgerEntryIsDebit = payload?.bankLedgerEntryIsDebit === true;
  const amount = toMoney(payload?.amount);
  const narration = String(payload?.narration || payload?.description || "").trim();
  const referenceNumber = String(payload?.referenceNumber || payload?.transactionId || "").trim();
  const billAllocations = Array.isArray(payload?.billAllocations) ? payload.billAllocations : [];

  if (!bankLedgerName || !counterpartyLedgerName) {
    throw new Error("Bank voucher command requires bank and counterparty ledgers.");
  }

  const partyLedgerName = counterpartyIsPartyLedger ? counterpartyLedgerName : bankLedgerName;
  const bankAllocation =
    voucherType !== "Journal" && options.includeBankAllocation === true
      ? buildBankAllocationXml({
          voucherDate,
          referenceNumber,
          amount,
          isDebit: bankLedgerEntryIsDebit,
        })
      : null;

  const entries =
    voucherType === "Journal"
      ? bankLedgerEntryIsDebit
        ? [
            buildLedgerEntryXml({ ledgerName: bankLedgerName, amount, isDebit: true }),
            buildLedgerEntryXml({ ledgerName: counterpartyLedgerName, amount, isDebit: false }),
          ]
        : [
            buildLedgerEntryXml({ ledgerName: counterpartyLedgerName, amount, isDebit: true }),
            buildLedgerEntryXml({ ledgerName: bankLedgerName, amount, isDebit: false }),
          ]
      : voucherType === "Receipt"
      ? [
          buildLedgerEntryXml({
            ledgerName: counterpartyLedgerName,
            amount,
            isDebit: false,
            isPartyLedger: counterpartyIsPartyLedger,
            billAllocations: buildBillAllocationsXml({ allocations: billAllocations, isDebit: false }),
          }),
          buildLedgerEntryXml({
            ledgerName: bankLedgerName,
            amount,
            isDebit: true,
            bankAllocation,
          }),
        ]
      : voucherType === "Contra"
        ? [
          buildLedgerEntryXml({
            ledgerName: bankLedgerName,
            amount,
            isDebit: true,
            bankAllocation,
          }),
          buildLedgerEntryXml({ ledgerName: counterpartyLedgerName, amount, isDebit: false }),
        ]
        : [
            buildLedgerEntryXml({
              ledgerName: counterpartyLedgerName,
              amount,
              isDebit: true,
              isPartyLedger: counterpartyIsPartyLedger,
            }),
            buildLedgerEntryXml({
              ledgerName: bankLedgerName,
              amount,
              isDebit: false,
              bankAllocation,
            }),
          ];

  return wrapVoucherMessagesXml({
    companyName,
    voucherDate,
    legacyHeader: options.legacyHeader === true,
    messages: [
      buildVoucherMessageXml({
        voucherDate,
        voucherType,
        referenceNumber,
        narration,
        entries,
        partyLedgerName: voucherType === "Journal" ? null : partyLedgerName,
      }),
    ],
  });
}

function removeTags(xml, tagNames) {
  return tagNames.reduce(
    (nextXml, tagName) =>
      nextXml.replace(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi"), ""),
    xml
  );
}

function setAllPartyLedgerFlagsNo(xml) {
  return xml.replace(/<ISPARTYLEDGER>Yes<\/ISPARTYLEDGER>/gi, "<ISPARTYLEDGER>No</ISPARTYLEDGER>");
}

function withoutVoucherPresentationHints(xml) {
  return removeTags(xml.replace(/\sOBJVIEW="[^"]*"/gi, ""), ["PERSISTEDVIEW"]);
}

function withoutAccountingBooleans(xml) {
  return removeTags(xml, ["ISINVOICE", "ISOPTIONAL", "DIFFACTUALQTY", "FORJOBCOSTING"]);
}

function withVoucherDateAttribute(xml, voucherDate) {
  return xml.replace(/<VOUCHER\b(?![^>]*\bDATE=)/i, `<VOUCHER DATE="${voucherDate}"`);
}

function withVoucherNameAttribute(xml, referenceNumber) {
  const escapedReferenceNumber = escapeXml(referenceNumber);
  if (!escapedReferenceNumber) return xml;
  return xml.replace(/<VOUCHER\b(?![^>]*\bNAME=)/i, `<VOUCHER NAME="${escapedReferenceNumber}"`);
}

function buildBankVoucherDiagnosticVariants(payload, fallbackCompanyName) {
  const voucherDate = toIsoLikeDate(payload?.voucherDate);
  const referenceNumber = String(payload?.referenceNumber || payload?.transactionId || "").trim();
  const current = buildBankVoucherXml(payload, fallbackCompanyName);
  const noPartyLedgerMarkers = setAllPartyLedgerFlagsNo(removeTags(current, ["PARTYLEDGERNAME"]));
  const noPresentationHints = withoutVoucherPresentationHints(current);
  const minimalAccounting = withoutAccountingBooleans(
    withoutVoucherPresentationHints(noPartyLedgerMarkers)
  );

  return [
    {
      name: "current",
      description: "Current bridge XML.",
      xml: current,
    },
    {
      name: "with-voucher-date-attribute",
      description: "Current XML plus DATE on the VOUCHER attribute, matching the previous bridge attempt.",
      xml: withVoucherDateAttribute(current, voucherDate),
    },
    {
      name: "no-party-ledger-markers",
      description: "Removes PARTYLEDGERNAME and forces ISPARTYLEDGER=No on ledger entries.",
      xml: noPartyLedgerMarkers,
    },
    {
      name: "no-presentation-hints",
      description: "Removes OBJVIEW and PERSISTEDVIEW while keeping accounting/date fields.",
      xml: noPresentationHints,
    },
    {
      name: "minimal-accounting",
      description: "Keeps voucher date/type/reference/narration and ledger entries; removes view, party, and accounting boolean hints.",
      xml: minimalAccounting,
    },
    {
      name: "minimal-with-date-attribute",
      description: "Minimal accounting XML plus DATE on the VOUCHER attribute.",
      xml: withVoucherDateAttribute(minimalAccounting, voucherDate),
    },
    {
      name: "minimal-with-name-and-date-attributes",
      description: "Minimal accounting XML plus NAME and DATE on the VOUCHER attribute.",
      xml: withVoucherNameAttribute(withVoucherDateAttribute(minimalAccounting, voucherDate), referenceNumber),
    },
  ];
}

function getBankVoucherDiagnosticVariantXml(payload, fallbackCompanyName, variantName) {
  const variants = buildBankVoucherDiagnosticVariants(payload, fallbackCompanyName);
  const variant = variants.find((entry) => entry.name === variantName);
  if (!variant) {
    throw new Error(`Unknown variant "${variantName}". Available: ${variants.map((entry) => entry.name).join(", ")}`);
  }
  return variant.xml;
}

function parseExportResult(text, httpStatus) {
  const lineError = getTagText(text, "LINEERROR");
  const statusText = getTagText(text, "STATUS");

  return {
    success: httpStatus >= 200 && httpStatus < 300 && !lineError && statusText === "1",
    error: lineError,
    status: statusText,
    response: text,
  };
}

function extractCompanyName(xml) {
  const currentCompany = xml.match(/<CURRENTCOMPANY[^>]*>([^<]+)<\/CURRENTCOMPANY>/i)?.[1];
  if (currentCompany) {
    return currentCompany.trim();
  }

  return null;
}

function parseTallyImportResult(text, httpStatus) {
  const lineError = getTagText(text, "LINEERROR");
  const statusText = getTagText(text, "STATUS");
  const dataText = getTagText(text, "DATA");
  const errorsText = text.match(/<ERRORS[^>]*>([^<]+)<\/ERRORS>/i)?.[1]?.trim() ?? null;
  const alteredText = text.match(/<ALTERED[^>]*>([^<]+)<\/ALTERED>/i)?.[1]?.trim() ?? null;
  const createdText = text.match(/<CREATED[^>]*>([^<]+)<\/CREATED>/i)?.[1]?.trim() ?? null;
  const errors = errorsText ? Number(errorsText) : null;
  const responseError =
    lineError ||
    (statusText === "0" && dataText ? dataText.replace(/\s+/g, " ").trim() : null);

  return {
    success: httpStatus >= 200 && httpStatus < 300 && !responseError && (errors === null || errors === 0),
    error: responseError,
    result: {
      httpStatus,
      altered: alteredText ? Number(alteredText) : null,
      created: createdText ? Number(createdText) : null,
      errors,
      response: text.slice(0, 4000),
    },
  };
}

function requireCreatedVoucher(outcome) {
  const created = Number(outcome.result?.created ?? 0) || 0;
  const altered = Number(outcome.result?.altered ?? 0) || 0;

  if (!outcome.success || created > 0 || altered > 0) {
    return outcome;
  }

  return {
    ...outcome,
    success: false,
    error: `Tally accepted the voucher import request but did not report a created voucher. CREATED=${created}, ALTERED=${altered}.`,
  };
}

async function postBankVoucher(tallyUrl, payload, companyName) {
  const primaryXml = buildBankVoucherXml(payload, companyName);
  const primaryOutcome = explainBankVoucherTallyError(
    requireCreatedVoucher(await invokeTallyXml(tallyUrl, primaryXml)),
    payload
  );

  return { outcome: primaryOutcome, xml: primaryXml, retriedWithLegacyHeader: false };
}

async function postCustomerAdvanceAdjustment(tallyUrl, payload, companyName) {
  const xml = buildCustomerAdvanceAdjustmentXml(payload, companyName);
  const outcome = requireCreatedVoucher(await invokeTallyXml(tallyUrl, xml));

  return { outcome, xml };
}

async function invokeTallyXml(tallyUrl, xml) {
  const controller = new AbortController();
  let timeout;

  try {
    const response = await Promise.race([
      fetch(tallyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml",
        },
        body: xml,
        signal: controller.signal,
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          const error = new Error("Tally import timed out.");
          error.name = "AbortError";
          reject(error);
        }, TALLY_IMPORT_TIMEOUT_MS);
      }),
    ]);

    const text = await response.text();
    return parseTallyImportResult(text, response.status);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function previewXml(xml) {
  return xml.replace(/\s+/g, " ").trim().slice(0, 4000);
}

async function exportTallyCollection(tallyUrl, options) {
  const response = await fetch(tallyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
    },
    body: buildCollectionExportXml(options),
  });

  const text = await response.text();
  const result = parseExportResult(text, response.status);
  if (!result.success) {
    throw new Error(
      result.error ||
        `Tally export failed for ${options.collectionName} with HTTP ${response.status}.`
    );
  }

  return text;
}

function toMaster(block, tagName) {
  const name = getAttribute(block, "NAME") || getTagText(block, "NAME");
  if (!name) return null;

  const bankName =
    getTagText(block, "BANKNAME") ||
    getTagText(block, "BANK") ||
    getTagText(block, "BANKERNAME");
  const bankAccountNumber =
    getTagText(block, "BANKACCOUNTNUMBER") ||
    getTagText(block, "ACCOUNTNUMBER") ||
    getTagText(block, "BANKACCOUNTNO") ||
    getTagText(block, "BANKACNO") ||
    getTagText(block, "ACNUMBER");
  const ifscCode =
    getTagText(block, "IFSCCODE") ||
    getTagText(block, "IFSCODE") ||
    getTagText(block, "IFSC") ||
    getTagText(block, "BANKIFSCCODE");
  const branchName =
    getTagText(block, "BRANCHNAME") ||
    getTagText(block, "BANKBRANCHNAME") ||
    getTagText(block, "BRANCH");
  const accountHolderName =
    getTagText(block, "BANKACCHOLDERNAME") ||
    getTagText(block, "BANKACCOUNTNAME") ||
    getTagText(block, "BANKACCOUNTHOLDERNAME") ||
    getTagText(block, "ACCOUNTHOLDERNAME");
  const taxRate =
    getTagText(block, "RATEOFTAXCALCULATION") ||
    getTagText(block, "GSTTAXRATE") ||
    getTagText(block, "RATEOFVAT");

  return {
    name,
    guid: getTagText(block, "GUID"),
    parent: getTagText(block, "PARENT"),
    gstin: getTagText(block, "PARTYGSTIN"),
    bankName,
    bankAccountNumber,
    ifscCode,
    branchName,
    accountHolderName,
    hsnCode: getTagText(block, "GSTHSNCODE") || getTagText(block, "HSNCODE"),
    unitName: getTagText(block, "BASEUNITS") || getTagText(block, "ORIGINALBASEUNITS"),
    taxRate,
    raw: {
      tallyTag: tagName,
      reservedName: getAttribute(block, "RESERVEDNAME"),
      taxType: getTagText(block, "TAXTYPE"),
      gstDutyHead: getTagText(block, "GSTDUTYHEAD"),
    },
  };
}

function dedupeMasters(masters) {
  const seen = new Set();
  const result = [];

  for (const master of masters) {
    const key = `${master.guid || ""}:${master.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(master);
  }

  return result;
}

function parseMasterCollection(xml, tagName) {
  return dedupeMasters(
    extractBlocks(xml, tagName)
      .map((block) => toMaster(block, tagName))
      .filter(Boolean)
  );
}

function toVoucher(block) {
  const ledgerNames = extractBlocks(block, "ALLLEDGERENTRIES.LIST")
    .map((entry) => getTagText(entry, "LEDGERNAME"))
    .filter(Boolean);

  return {
    date: getTagText(block, "DATE"),
    effectiveDate: getTagText(block, "EFFECTIVEDATE"),
    voucherType: getTagText(block, "VOUCHERTYPENAME") || getAttribute(block, "VCHTYPE"),
    voucherNumber: getTagText(block, "VOUCHERNUMBER"),
    reference: getTagText(block, "REFERENCE"),
    narration: getTagText(block, "NARRATION"),
    partyLedgerName: getTagText(block, "PARTYLEDGERNAME"),
    ledgerNames,
    masterId: getTagText(block, "MASTERID"),
    alterId: getTagText(block, "ALTERID"),
    isCancelled: getTagText(block, "ISCANCELLED"),
    rawPreview: previewXml(block),
  };
}

function parseVoucherCollection(xml) {
  return extractBlocks(xml, "VOUCHER").map(toVoucher);
}

function parseTallyAmount(value) {
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/\s*(Dr|Cr)$/i, "")
    .trim();
  if (!cleaned) return null;
  const negative = cleaned.startsWith("-") || /^\(.*\)$/.test(cleaned);
  const normalized = cleaned.replace(/[()]/g, "").replace(/^-/, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function parseTallyDate(value) {
  const raw = String(value ?? "").trim();
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return raw || null;
}

function billReferenceType(block) {
  return (
    getTagText(block, "BILLTYPE") ||
    getTagText(block, "TYPEOFREF") ||
    getTagText(block, "REFERENCE_TYPE") ||
    ""
  ).trim();
}

function billLedgerName(block) {
  return (
    getTagText(block, "LEDGERNAME") ||
    getTagText(block, "PARTYLEDGERNAME") ||
    getTagText(block, "PARENT") ||
    getTagText(block, "LEDGER") ||
    ""
  ).trim();
}

function normalizeLooseName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toOpenBill(block, ledgerName) {
  const referenceName = getAttribute(block, "NAME") || getTagText(block, "NAME") || getTagText(block, "BILLREF");
  if (!referenceName) return null;
  const rowLedgerName = billLedgerName(block);
  if (rowLedgerName && normalizeLooseName(rowLedgerName) !== normalizeLooseName(ledgerName)) return null;

  const closing =
    parseTallyAmount(getTagText(block, "CLOSINGBALANCE")) ??
    parseTallyAmount(getTagText(block, "BALANCE")) ??
    parseTallyAmount(getTagText(block, "PENDINGAMOUNT")) ??
    parseTallyAmount(getTagText(block, "AMOUNT"));
  const pendingAmount = Math.abs(closing ?? 0);
  if (pendingAmount <= 0) return null;

  const type = billReferenceType(block).toLowerCase();
  const common = {
    referenceName,
    voucherNumber: getTagText(block, "VOUCHERNUMBER") || referenceName,
    invoiceDate: parseTallyDate(getTagText(block, "DATE") || getTagText(block, "BILLDATE")),
    dueDate: parseTallyDate(getTagText(block, "DUEDATE")),
    originalAmount: Math.abs(parseTallyAmount(getTagText(block, "OPENINGBALANCE")) ?? pendingAmount),
    settledAmount: null,
    pendingAmount,
    sourceVoucherType: getTagText(block, "VOUCHERTYPENAME") || getTagText(block, "VOUCHERTYPE") || null,
    status: "open",
  };

  if (type.includes("advance")) {
    return {
      kind: "advance",
      referenceName,
      receiptDate: common.invoiceDate,
      pendingAdvanceAmount: pendingAmount,
      status: "unadjusted",
    };
  }

  return { kind: "bill", ...common };
}

async function fetchCustomerOpenBillsFromTally(config, commandPayload = {}) {
  const ledgerName = String(commandPayload.ledgerName || "").trim();
  if (!ledgerName) {
    throw new Error("Customer open bill fetch requires ledgerName.");
  }

  const companyName = commandPayload.companyName || config.companyName || null;
  const tallyUrl = normalizeTallyUrl(commandPayload.tallyUrl || config.tallyUrl);
  const xml = await exportTallyCollection(tallyUrl, {
    collectionName: "Autodealer Customer Open Bills",
    tallyType: "Bill",
    childOf: ledgerName,
    fetchFields:
      "Name,Parent,LedgerName,PartyLedgerName,BillType,TypeOfRef,Date,BillDate,DueDate,VoucherNumber,VoucherTypeName,OpeningBalance,ClosingBalance,Balance,PendingAmount,Amount",
    companyName,
  });
  const parsed = extractBlocks(xml, "BILL")
    .map((block) => toOpenBill(block, ledgerName))
    .filter(Boolean);

  return {
    success: true,
    result: {
      ledgerName,
      openBills: parsed.filter((entry) => entry.kind === "bill").map(({ kind, ...entry }) => entry),
      existingAdvances: parsed.filter((entry) => entry.kind === "advance").map(({ kind, ...entry }) => entry),
      rawCount: parsed.length,
    },
  };
}

function isTaxLedger(master) {
  const name = master.name || "";
  const parent = master.parent || "";
  const raw = master.raw || {};

  return (
    /gst|cgst|sgst|igst|cess/i.test(name) ||
    /duties|taxes/i.test(parent) ||
    /gst|tax/i.test(String(raw.taxType || "")) ||
    /gst|tax/i.test(String(raw.gstDutyHead || ""))
  );
}

async function collectTallyMasters(config, commandPayload = {}) {
  const companyName = commandPayload.companyName || config.companyName || null;
  const tallyUrl = normalizeTallyUrl(commandPayload.tallyUrl || config.tallyUrl);

  const [ledgerXml, groupXml, voucherTypeXml] = await Promise.all([
    exportTallyCollection(tallyUrl, {
      collectionName: "Autodealer Ledgers Sync",
      tallyType: "Ledger",
      fetchFields:
        "Name,Parent,GUID,PartyGSTIN,BankName,Bank,BankerName,BankAccountNumber,AccountNumber,BankAccountNo,BankAcNo,AcNumber,IFSCCODE,IFSCODE,IFSC,BankIFSCCODE,BranchName,BankBranchName,Branch,BankAccHolderName,BankAccountName,BankAccountHolderName,AccountHolderName,TaxType,GSTDutyHead,RateOfTaxCalculation",
      companyName,
    }),
    exportTallyCollection(tallyUrl, {
      collectionName: "Autodealer Groups Sync",
      tallyType: "Group",
      fetchFields: "Name,Parent,GUID",
      companyName,
    }),
    exportTallyCollection(tallyUrl, {
      collectionName: "Autodealer Voucher Types Sync",
      tallyType: "VoucherType",
      fetchFields: "Name,Parent,GUID",
      companyName,
    }),
  ]);

  const ledgers = parseMasterCollection(ledgerXml, "LEDGER");
  const groups = parseMasterCollection(groupXml, "GROUP");
  const voucherTypes = parseMasterCollection(voucherTypeXml, "VOUCHERTYPE");
  const gstLedgers = dedupeMasters(ledgers.filter(isTaxLedger));

  return {
    ledgers,
    groups,
    stockItems: [],
    units: [],
    voucherTypes,
    gstLedgers,
    taxLedgers: gstLedgers,
  };
}

async function postMastersToBackend(config, payload) {
  const response = await fetch(`${config.apiBase}/api/tally/bridge/masters`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.bridgeToken}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result.error || `Master sync upload failed with HTTP ${response.status}.`);
  }

  return result;
}

async function syncMastersFromTally(config, commandPayload = {}) {
  const companyName = commandPayload.companyName || config.companyName || null;
  const tallyUrl = normalizeTallyUrl(commandPayload.tallyUrl || config.tallyUrl);
  const readiness = await testTally(tallyUrl, companyName);

  if (!readiness.tallyReachable) {
    throw new Error(readiness.error || "Tally Prime is not reachable.");
  }

  if (!readiness.companyLoaded) {
    throw new Error(readiness.error || "Tally Prime is reachable, but no company is loaded.");
  }

  const masters = await collectTallyMasters(
    {
      ...config,
      tallyUrl,
      companyName: companyName || readiness.companyName || config.companyName,
    },
    commandPayload
  );

  if (masters.ledgers.length === 0) {
    throw new Error("Tally returned zero ledgers. Open the correct company and try sync again.");
  }

  const payload = {
    connectionId: config.connectionId,
    companyName: companyName || readiness.companyName || config.companyName,
    bridgeVersion: BRIDGE_VERSION,
    masters,
  };
  const syncResult = await postMastersToBackend(config, payload);

  return {
    success: true,
    result: {
      syncRunId: syncResult.syncRunId,
      totals: syncResult.totals,
      accepted: syncResult.accepted,
      companyName: payload.companyName,
      bridgeVersion: payload.bridgeVersion,
    },
  };
}

async function testTally(tallyUrl, companyName) {
  try {
    const response = await fetch(tallyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
      },
      body: buildTallyReadinessXml(companyName),
    });

    const text = await response.text();
    const looksLikeXml = /<\?xml|<ENVELOPE|<RESPONSE|<LISTOF/i.test(text);
    const responseCompanyName = looksLikeXml ? extractCompanyName(text) : null;
    const lineError = text.match(/<LINEERROR[^>]*>([\s\S]*?)<\/LINEERROR>/i)?.[1]?.trim() ?? null;
    const status = text.match(/<STATUS[^>]*>([^<]+)<\/STATUS>/i)?.[1]?.trim() ?? null;

    if (!response.ok) {
      return {
        tallyReachable: false,
        companyLoaded: false,
        companyName: responseCompanyName ?? companyName ?? null,
        error: `Tally returned HTTP ${response.status}.`,
      };
    }

    if (!looksLikeXml) {
      return {
        tallyReachable: true,
        companyLoaded: false,
        companyName: responseCompanyName ?? companyName ?? null,
        error: "Tally responded, but the response was not XML.",
      };
    }

    return {
      tallyReachable: true,
      companyLoaded: !lineError && status === "1",
      companyName: responseCompanyName ?? companyName ?? null,
      error: lineError,
    };
  } catch (error) {
    return {
      tallyReachable: false,
      companyLoaded: false,
      companyName: null,
      error: error instanceof Error ? error.message : String(error ?? "Unable to reach Tally."),
    };
  }
}

async function receiveNextCommand(config) {
  const url = new URL(`${config.apiBase}/api/tally/bridge/commands/next`);
  url.searchParams.set("connectionId", config.connectionId);
  url.searchParams.set("bridgeVersion", BRIDGE_VERSION);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.bridgeToken}`,
    },
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || `Command poll failed with HTTP ${response.status}.`);
  }

  return payload.command ?? null;
}

async function sendCommandResult(config, command, outcome) {
  const status = outcome.success ? "succeeded" : "failed";
  const error = outcome.error ?? null;
  console.log(`Reporting command ${command.id} as ${status}${error ? `: ${error}` : ""}`);

  const response = await fetch(`${config.apiBase}/api/tally/bridge/commands/${command.id}/result`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.bridgeToken}`,
    },
    body: JSON.stringify({
      connectionId: config.connectionId,
      status,
      success: outcome.success,
      result: outcome.result ?? {},
      error,
    }),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || `Command result failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function runCommand(config, command) {
  if (!command) return;

  if (command.commandType === "sync_masters") {
    try {
      const outcome = await syncMastersFromTally(config, command.payload);
      await sendCommandResult(config, command, outcome);
      const totals = outcome.result?.totals || {};
      console.log(
        `Command ${command.id} completed: synced ledgers=${totals.ledger ?? 0}, gstLedgers=${totals.gst_ledger ?? 0}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "Master sync failed.");
      await sendCommandResult(config, command, {
        success: false,
        result: {},
        error: message,
      });
      console.log(`Command ${command.id} failed: ${message}`);
    }
    return;
  }

  if (command.commandType === "alter_ledger") {
    const xml = buildAlterLedgerXml(command.payload, config.companyName);
    const outcome = await invokeTallyXml(config.tallyUrl, xml);
    await sendCommandResult(config, command, outcome);
    console.log(
      outcome.success
        ? `Command ${command.id} completed: ledger altered.`
        : `Command ${command.id} failed: ${outcome.error || "Tally returned an error."}`
    );
    return;
  }

  if (command.commandType === "create_ledger") {
    const xml = buildCreateLedgerXml(command.payload, config.companyName);
    const outcome = await invokeTallyXml(config.tallyUrl, xml);
    await sendCommandResult(config, command, {
      ...outcome,
      result: {
        ...(outcome.result || {}),
        requestXml: previewXml(xml),
        ledgerName: command.payload?.name,
        parentName: command.payload?.parentName,
      },
    });
    console.log(
      outcome.success
        ? `Command ${command.id} completed: ledger created.`
        : `Command ${command.id} failed: ${outcome.error || "Tally returned an error."}`
    );
    return;
  }

  if (command.commandType === "fetch_customer_open_bills") {
    try {
      const outcome = await fetchCustomerOpenBillsFromTally(config, command.payload);
      await sendCommandResult(config, command, outcome);
      console.log(
        `Command ${command.id} completed: fetched open bills for ${command.payload?.ledgerName || "customer"}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "Open bill fetch failed.");
      await sendCommandResult(config, command, {
        success: false,
        result: {},
        error: message,
      });
      console.log(`Command ${command.id} failed: ${message}`);
    }
    return;
  }

  if (command.commandType === "post_bank_voucher") {
    let xml = null;
    try {
      const posted = await postBankVoucher(
        config.tallyUrl,
        command.payload,
        config.companyName
      );
      xml = posted.xml;
      const outcome = posted.outcome;
      await sendCommandResult(config, command, {
        ...outcome,
        result: {
          ...(outcome.result || {}),
          requestXml: previewXml(xml),
          retriedWithLegacyHeader: posted.retriedWithLegacyHeader,
          transactionId: command.payload?.transactionId,
          voucherId: command.payload?.referenceNumber || command.id,
        },
      });
      console.log(
        outcome.success
          ? `Command ${command.id} completed: bank voucher posted.`
          : `Command ${command.id} failed: ${outcome.error || "Tally returned an error."}`
      );
      if (!outcome.success) {
        console.log(`Command ${command.id} Tally request XML: ${previewXml(xml)}`);
      }
    } catch (error) {
      const message =
        error?.name === "AbortError"
          ? "Tally did not respond within 30 seconds while posting the bank voucher."
          : error instanceof Error
            ? error.message
            : String(error ?? "Bank voucher posting failed.");
      await sendCommandResult(config, command, {
        success: false,
        error: message,
        result: {
          requestXml: xml ? previewXml(xml) : null,
          commandPayload: command.payload ?? {},
          transactionId: command.payload?.transactionId,
          voucherId: command.payload?.referenceNumber || command.id,
        },
      });
      console.log(`Command ${command.id} failed: ${message}`);
    }
    return;
  }

  if (command.commandType === "adjust_customer_advance") {
    let xml = null;
    try {
      const posted = await postCustomerAdvanceAdjustment(
        config.tallyUrl,
        command.payload,
        config.companyName
      );
      xml = posted.xml;
      const outcome = posted.outcome;
      await sendCommandResult(config, command, {
        ...outcome,
        result: {
          ...(outcome.result || {}),
          requestXml: previewXml(xml),
          sourceBankTransactionId: command.payload?.sourceBankTransactionId,
          voucherId: command.payload?.referenceNumber || command.id,
        },
      });
      console.log(
        outcome.success
          ? `Command ${command.id} completed: customer advance adjusted.`
          : `Command ${command.id} failed: ${outcome.error || "Tally returned an error."}`
      );
      if (!outcome.success) {
        console.log(`Command ${command.id} Tally request XML: ${previewXml(xml)}`);
      }
    } catch (error) {
      const message =
        error?.name === "AbortError"
          ? "Tally did not respond within 30 seconds while adjusting the customer advance."
          : error instanceof Error
            ? error.message
            : String(error ?? "Customer advance adjustment failed.");
      await sendCommandResult(config, command, {
        success: false,
        error: message,
        result: {
          requestXml: xml ? previewXml(xml) : null,
          commandPayload: command.payload ?? {},
          sourceBankTransactionId: command.payload?.sourceBankTransactionId,
          voucherId: command.payload?.referenceNumber || command.id,
        },
      });
      console.log(`Command ${command.id} failed: ${message}`);
    }
    return;
  }

  await sendCommandResult(config, command, {
    success: false,
    result: {},
    error: `Unsupported command type: ${command.commandType}`,
  });
}

async function pairBridge(args) {
  const apiBase = normalizeBaseUrl(args["api-base"]);
  const connectionId = required(args["connection-id"], "connection-id");
  const pairingCode = required(args["pairing-code"], "pairing-code");
  const tallyUrl = normalizeTallyUrl(args["tally-url"]);
  const bridgeName = args["bridge-name"] || os.hostname() || "Tally Bridge";
  const bridgeMachineId = args["bridge-machine-id"] || createMachineId();
  const companyName = args["company-name"] || null;

  const response = await fetch(`${apiBase}/api/tally/connections/${connectionId}/pair`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pairingCode,
      bridgeName,
      bridgeVersion: BRIDGE_VERSION,
      bridgeMachineId,
    }),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok || !payload.bridgeToken) {
    throw new Error(payload.error || `Pairing failed with HTTP ${response.status}.`);
  }

  writeConfig({
    apiBase,
    connectionId,
    bridgeToken: payload.bridgeToken,
    tallyUrl,
    companyName,
    bridgeName,
    bridgeVersion: BRIDGE_VERSION,
    bridgeMachineId,
  });

  console.log("Tally bridge paired successfully.");
  console.log(`Config saved to ${CONFIG_PATH}`);
}

async function sendHeartbeat(config, testResult) {
  const response = await fetch(`${config.apiBase}/api/tally/bridge/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.bridgeToken}`,
    },
    body: JSON.stringify({
      connectionId: config.connectionId,
      tallyUrl: config.tallyUrl,
      bridgeVersion: BRIDGE_VERSION,
      ...testResult,
    }),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error || `Heartbeat failed with HTTP ${response.status}.`);
  }

  return payload;
}

async function runOnce(config) {
  const result = await testTally(config.tallyUrl, config.companyName);
  await sendHeartbeat(config, result);
  const company = result.companyName ? ` Company: ${result.companyName}.` : "";
  const error = result.error ? ` Error: ${result.error}` : "";
  console.log(
    `Heartbeat sent. Tally reachable: ${result.tallyReachable}. Company loaded: ${result.companyLoaded}.${company}${error}`
  );

  try {
    const command = await receiveNextCommand(config);
    if (command) {
      await runCommand(config, command);
    }
  } catch (commandError) {
    console.error(commandError instanceof Error ? commandError.message : commandError);
  }
}

async function startBridge(args) {
  const config = readConfig();
  if (!config) {
    throw new Error(`Bridge is not paired. Run pair first. Expected config at ${CONFIG_PATH}`);
  }

  if (args["tally-url"]) {
    config.tallyUrl = normalizeTallyUrl(args["tally-url"]);
    writeConfig(config);
  }

  if (args["company-name"]) {
    config.companyName = args["company-name"];
    writeConfig(config);
  }

  const intervalMs = Number(args.interval || DEFAULT_HEARTBEAT_INTERVAL_MS);
  console.log(`Starting Tally bridge for ${config.tallyUrl}`);
  console.log(`Sending heartbeat every ${intervalMs} ms.`);

  let running = false;
  const runSerially = async () => {
    if (running) {
      console.log("Previous bridge cycle is still running; skipping this heartbeat.");
      return;
    }

    running = true;
    try {
      await runOnce(config);
    } finally {
      running = false;
    }
  };

  await runOnce(config);
  setInterval(() => {
    runSerially().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
  }, intervalMs);
}

async function testBridge(args) {
  const config = readConfig() ?? {
    tallyUrl: normalizeTallyUrl(args["tally-url"]),
  };
  const result = await testTally(
    normalizeTallyUrl(args["tally-url"] || config.tallyUrl),
    args["company-name"] || config.companyName
  );
  console.log(JSON.stringify(result, null, 2));
}

async function syncMastersCli(args) {
  const config = readConfig();
  if (!config) {
    throw new Error(`Bridge is not paired. Run pair first. Expected config at ${CONFIG_PATH}`);
  }

  const nextConfig = { ...config };
  if (args["tally-url"]) {
    nextConfig.tallyUrl = normalizeTallyUrl(args["tally-url"]);
  }
  if (args["company-name"]) {
    nextConfig.companyName = args["company-name"];
  }

  const outcome = await syncMastersFromTally(nextConfig, {
    companyName: args["company-name"] || nextConfig.companyName,
    tallyUrl: nextConfig.tallyUrl,
  });

  console.log(JSON.stringify(outcome.result, null, 2));
}

function readJsonPayload(args) {
  if (args["payload-json"]) {
    return JSON.parse(args["payload-json"]);
  }

  if (args["payload-file"]) {
    return JSON.parse(fs.readFileSync(args["payload-file"], "utf8"));
  }

  throw new Error("Provide --payload-file <path> or --payload-json '<json>'.");
}

async function validateBankVoucherCli(args) {
  const payload = readJsonPayload(args);
  const config = readConfig();
  const companyName = args["company-name"] || config?.companyName || null;
  const xml = buildBankVoucherXml(payload, companyName);

  console.log(JSON.stringify(
    {
      ok: true,
      commandType: "post_bank_voucher",
      companyName: payload.companyName || companyName,
      voucherType: payload.voucherType || "Payment",
      voucherDate: toIsoLikeDate(payload.voucherDate),
      bankLedgerName: payload.bankLedgerName,
      counterpartyLedgerName: payload.counterpartyLedgerName,
      amount: toMoney(payload.amount),
      requestXml: previewXml(xml),
    },
    null,
    2
  ));
}

function shouldPostDiagnostics(args) {
  return String(args.post || "").toLowerCase() === "true" || String(args.post || "").toLowerCase() === "yes";
}

function writeDiagnosticArtifact(outputDir, variantName, extension, content) {
  if (!outputDir) return null;
  fs.mkdirSync(outputDir, { recursive: true });
  const safeName = variantName.replace(/[^a-z0-9._-]/gi, "-");
  const filePath = path.join(outputDir, `${safeName}.${extension}`);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

async function diagnoseBankVoucherCli(args) {
  const payload = readJsonPayload(args);
  const config = readConfig();
  const post = shouldPostDiagnostics(args);
  if (post && !config && !args["tally-url"]) {
    throw new Error(`Bridge is not paired. Run pair first or pass --tally-url. Expected config at ${CONFIG_PATH}`);
  }

  const companyName = args["company-name"] || payload.companyName || config?.companyName || null;
  const tallyUrl = post ? normalizeTallyUrl(args["tally-url"] || config?.tallyUrl) : null;
  const stopOnSuccess = String(args["stop-on-success"] ?? "true").toLowerCase() !== "false";
  const outputDir = args["output-dir"] || null;
  const variants = buildBankVoucherDiagnosticVariants(payload, companyName);
  const requestedVariantNames = String(args.variants || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const selectedVariants = requestedVariantNames.length
    ? variants.filter((variant) => requestedVariantNames.includes(variant.name))
    : variants;

  if (selectedVariants.length === 0) {
    throw new Error(`No diagnostic variants matched --variants. Available: ${variants.map((variant) => variant.name).join(", ")}`);
  }

  const results = [];
  for (const variant of selectedVariants) {
    const requestXmlPath = writeDiagnosticArtifact(outputDir, variant.name, "request.xml", variant.xml);
    const result = {
      name: variant.name,
      description: variant.description,
      requestXmlPath,
      requestXml: outputDir ? undefined : previewXml(variant.xml),
      posted: post,
      success: null,
      error: null,
      created: null,
      altered: null,
      errors: null,
      responsePath: null,
      responsePreview: null,
    };

    if (post) {
      const outcome = explainBankVoucherTallyError(
        await invokeTallyXml(tallyUrl, variant.xml),
        payload
      );
      const responseText = String(outcome.result?.response || "");
      result.success = outcome.success;
      result.error = outcome.error || null;
      result.created = outcome.result?.created ?? null;
      result.altered = outcome.result?.altered ?? null;
      result.errors = outcome.result?.errors ?? null;
      result.responsePath = writeDiagnosticArtifact(outputDir, variant.name, "response.xml", responseText);
      result.responsePreview = outputDir ? undefined : responseText;
      results.push(result);

      const created = Number(outcome.result?.created ?? 0) || 0;
      const altered = Number(outcome.result?.altered ?? 0) || 0;
      if (outcome.success && (created > 0 || altered > 0) && stopOnSuccess) {
        break;
      }
      continue;
    }

    results.push(result);
  }

  console.log(JSON.stringify(
    {
      ok: true,
      posted: post,
      tallyUrl: post ? tallyUrl : null,
      companyName,
      voucherType: payload.voucherType || "Payment",
      voucherDate: toIsoLikeDate(payload.voucherDate),
      referenceNumber: String(payload.referenceNumber || payload.transactionId || ""),
      outputDir,
      variants: results,
    },
    null,
    2
  ));
}

async function diagnoseBankVoucherDatesCli(args) {
  const payload = readJsonPayload(args);
  const config = readConfig();
  if (!config && !args["tally-url"]) {
    throw new Error(`Bridge is not paired. Run pair first or pass --tally-url. Expected config at ${CONFIG_PATH}`);
  }

  const companyName = args["company-name"] || payload.companyName || config?.companyName || null;
  const tallyUrl = normalizeTallyUrl(args["tally-url"] || config?.tallyUrl);
  const variantName = args.variant || "minimal-accounting";
  const outputDir = args["output-dir"] || null;
  const dateValues = String(args.dates || "2026-04-01,2026-06-03,2026-06-04")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (dateValues.length === 0) {
    throw new Error("Provide one or more dates with --dates YYYY-MM-DD,YYYY-MM-DD.");
  }

  const results = [];
  for (const dateValue of dateValues) {
    const voucherDate = toIsoLikeDate(dateValue);
    const datePayload = {
      ...payload,
      voucherDate: dateValue,
      referenceNumber: `DIAG-${payload.voucherType || "VCH"}-${voucherDate}`,
      narration: `${payload.narration || "Bank voucher diagnostic"} date probe ${dateValue}`,
    };
    const xml = getBankVoucherDiagnosticVariantXml(datePayload, companyName, variantName);
    const artifactName = `date-${voucherDate}`;
    const requestXmlPath = writeDiagnosticArtifact(outputDir, artifactName, "request.xml", xml);
    const outcome = explainBankVoucherTallyError(
      await invokeTallyXml(tallyUrl, xml),
      datePayload
    );
    const responseText = String(outcome.result?.response || "");
    const responsePath = writeDiagnosticArtifact(outputDir, artifactName, "response.xml", responseText);
    results.push({
      date: dateValue,
      voucherDate,
      referenceNumber: datePayload.referenceNumber,
      variant: variantName,
      success: outcome.success,
      error: outcome.error || null,
      created: outcome.result?.created ?? null,
      altered: outcome.result?.altered ?? null,
      errors: outcome.result?.errors ?? null,
      requestXmlPath,
      responsePath,
      responsePreview: outputDir ? undefined : responseText,
    });
  }

  console.log(JSON.stringify(
    {
      ok: true,
      posted: true,
      tallyUrl,
      companyName,
      voucherType: payload.voucherType || "Payment",
      variant: variantName,
      outputDir,
      results,
    },
    null,
    2
  ));
}

async function diagnoseTallyCompanyCli(args) {
  const config = readConfig();
  if (!config && !args["tally-url"]) {
    throw new Error(`Bridge is not paired. Run pair first or pass --tally-url. Expected config at ${CONFIG_PATH}`);
  }

  const tallyUrl = normalizeTallyUrl(args["tally-url"] || config?.tallyUrl);
  const companyName = args["company-name"] || config?.companyName || null;
  const xml = await exportTallyCollection(tallyUrl, {
    collectionName: "Autodealer Company Diagnostics",
    tallyType: "Company",
    fetchFields:
      "Name,Guid,StartingFrom,BooksFrom,FinancialYearFrom,CurrentPeriod,AlterID,MasterID",
    companyName,
  });
  const companies = parseMasterCollection(xml, "COMPANY");
  console.log(JSON.stringify(
    {
      ok: true,
      tallyUrl,
      companyName,
      companies,
      rawPreview: previewXml(xml),
    },
    null,
    2
  ));
}

async function findVouchersCli(args) {
  const config = readConfig();
  if (!config && !args["tally-url"]) {
    throw new Error(`Bridge is not paired. Run pair first or pass --tally-url. Expected config at ${CONFIG_PATH}`);
  }

  const tallyUrl = normalizeTallyUrl(args["tally-url"] || config.tallyUrl);
  const companyName = args["company-name"] || config?.companyName || null;
  const refs = String(args.refs || args.ref || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (refs.length === 0) {
    throw new Error("Provide --refs REF1,REF2 or --ref REF.");
  }

  const xml = await exportTallyCollection(tallyUrl, {
    collectionName: "Autodealer Voucher Lookup",
    tallyType: "Voucher",
    fetchFields:
      "Date,EffectiveDate,VoucherTypeName,VoucherNumber,Reference,Narration,PartyLedgerName,MasterID,AlterID,IsCancelled,AllLedgerEntries.LedgerName",
    companyName,
  });
  const vouchers = parseVoucherCollection(xml);
  const matches = vouchers.filter((voucher) => {
    const haystack = [
      voucher.voucherNumber,
      voucher.reference,
      voucher.narration,
      voucher.partyLedgerName,
      ...voucher.ledgerNames,
      voucher.rawPreview,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return refs.some((ref) => haystack.includes(ref.toLowerCase()));
  });

  console.log(JSON.stringify(
    {
      ok: true,
      companyName,
      searchedRefs: refs,
      scannedCount: vouchers.length,
      matchCount: matches.length,
      matches,
    },
    null,
    2
  ));
}

async function listVouchersCli(args) {
  const config = readConfig();
  if (!config && !args["tally-url"]) {
    throw new Error(`Bridge is not paired. Run pair first or pass --tally-url. Expected config at ${CONFIG_PATH}`);
  }

  const tallyUrl = normalizeTallyUrl(args["tally-url"] || config.tallyUrl);
  const companyName = args["company-name"] || config?.companyName || null;
  const limit = Math.max(1, Math.min(Number(args.limit || 20) || 20, 200));
  const xml = await exportTallyCollection(tallyUrl, {
    collectionName: "Autodealer Voucher List",
    tallyType: "Voucher",
    fetchFields:
      "Date,EffectiveDate,VoucherTypeName,VoucherNumber,Reference,Narration,PartyLedgerName,MasterID,AlterID,IsCancelled,AllLedgerEntries.LedgerName",
    companyName,
  });
  const vouchers = parseVoucherCollection(xml);

  console.log(JSON.stringify(
    {
      ok: true,
      companyName,
      scannedCount: vouchers.length,
      vouchers: vouchers.slice(-limit),
    },
    null,
    2
  ));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === "pair") {
    await pairBridge(args);
    return;
  }

  if (command === "start") {
    await startBridge(args);
    return;
  }

  if (command === "test") {
    await testBridge(args);
    return;
  }

  if (command === "sync-masters") {
    await syncMastersCli(args);
    return;
  }

  if (command === "validate-bank-voucher") {
    await validateBankVoucherCli(args);
    return;
  }

  if (command === "diagnose-bank-voucher") {
    await diagnoseBankVoucherCli(args);
    return;
  }

  if (command === "diagnose-bank-voucher-dates") {
    await diagnoseBankVoucherDatesCli(args);
    return;
  }

  if (command === "diagnose-tally-company") {
    await diagnoseTallyCompanyCli(args);
    return;
  }

  if (command === "find-vouchers") {
    await findVouchersCli(args);
    return;
  }

  if (command === "list-vouchers") {
    await listVouchersCli(args);
    return;
  }

  console.log("Usage:");
  console.log("  node apps/tally-bridge/src/bridge.mjs pair --api-base <url> --connection-id <id> --pairing-code <code> --company-name <name>");
  console.log("  node apps/tally-bridge/src/bridge.mjs start --company-name <name>");
  console.log("  node apps/tally-bridge/src/bridge.mjs sync-masters --company-name <name>");
  console.log("  node apps/tally-bridge/src/bridge.mjs validate-bank-voucher --payload-file <path>");
  console.log("  node apps/tally-bridge/src/bridge.mjs diagnose-bank-voucher --payload-file <path> --post true --output-dir ./tally-diagnostics");
  console.log("  node apps/tally-bridge/src/bridge.mjs diagnose-bank-voucher-dates --payload-file <path> --dates 2026-04-01,2026-06-03");
  console.log("  node apps/tally-bridge/src/bridge.mjs diagnose-tally-company --company-name <name>");
  console.log("  node apps/tally-bridge/src/bridge.mjs find-vouchers --refs REF1,REF2 --company-name <name>");
  console.log("  node apps/tally-bridge/src/bridge.mjs list-vouchers --company-name <name>");
  console.log("  node apps/tally-bridge/src/bridge.mjs test --tally-url http://localhost:9000 --company-name <name>");
}

main().catch((error) => {
  console.error(formatCliError(error));
  process.exit(1);
});
