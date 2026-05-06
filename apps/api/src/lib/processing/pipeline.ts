import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { summarizeCase } from "@/lib/case-summary";
import { DEFAULT_COMPARISON_OPTIONS, readComparisonOptions } from "@/lib/comparison";
import {
  ACTIVE_FIELD_DEFINITIONS,
  FIELD_LABELS,
  getFieldKeysForDocType,
  omitIgnoredFields,
} from "@/lib/document-schema";
import { getPersistedPacketFieldConfiguration } from "@/lib/field-settings-service";
import { isCommercialDocType, sanitizeLineItems } from "@/lib/line-items";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyCaseDocuments } from "@/services/verification";
import type { CaseAnalysisMode, CaseDoc, CommercialLineItem, DocType, FieldKey, Mismatch } from "@/types/pipeline";

import { callOpenRouter, getQualityExtractionModel, getQualityExtractionReasoning } from "./openrouter";

const STORAGE_BUCKET = "packet-files";
const execFileAsync = promisify(execFile);
const PDF_RENDER_DPI = Number(process.env.PACKET_PDF_RENDER_DPI ?? 160);
const PDF_RENDER_MAX_PAGES = Number(process.env.PACKET_PDF_RENDER_MAX_PAGES ?? 8);
const PDF_SMART_SPLIT_MAX_PAGES = Number(process.env.PACKET_PDF_SMART_SPLIT_MAX_PAGES ?? 20);

function resolvePdfJsWorkerSrc() {
  const candidates = [
    path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    path.resolve(process.cwd(), "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    path.resolve(process.cwd(), "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    path.resolve(process.cwd(), "../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ];

  const existingPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existingPath) {
    throw new Error("Unable to locate pdfjs-dist worker file in node_modules.");
  }

  return pathToFileURL(existingPath).href;
}

const PDFJS_WORKER_SRC = resolvePdfJsWorkerSrc();

const SUPPORTED_DOC_TYPES: DocType[] = [
  "Purchase Order",
  "Amended Purchase Order",
  "Invoice",
  "Tax Invoice",
  "E-Way Bill",
  "Weighment Slip",
  "Lorry Receipt",
  "Vehicle Registration Certificate",
  "Driving Licence",
  "PAN Card",
  "FASTag Toll Proof",
  "Material Test Certificate",
  "Photo Evidence",
  "Transport Permit",
  "Receipt",
  "Delivery Note",
  "Delivery Challan",
  "Bank Statement",
  "Map Printout",
  "Payment Screenshot",
  "Unknown",
];

const ALL_ALLOWED_FIELD_KEYS = ACTIVE_FIELD_DEFINITIONS.map((field) => field.key);

const FIELD_MAPPINGS: Partial<Record<FieldKey, string[]>> = {
  vendorName: ["vendorName", "sellerName", "supplierName", "vendor", "seller", "supplier", "consignorName", "issuerName"],
  supplierGstin: ["supplierGstin", "vendorGstin", "sellerGstin", "gstin", "gstinUin"],
  buyerName: ["buyerName", "customerName", "consigneeName", "buyer", "customer", "consignee", "billToName", "shipToName", "recipientName", "purchaserName"],
  buyerGstin: ["buyerGstin", "customerGstin", "consigneeGstin", "shipToGstin", "billToGstin", "recipientGstin", "purchaserGstin"],
  poNumber: ["poNumber", "purchaseOrderNumber"],
  poAmendmentNumber: ["poAmendmentNumber", "amendmentNumber", "poVersion", "revisionNumber"],
  invoiceNumber: ["invoiceNumber", "billNumber"],
  receiptNumber: ["receiptNumber"],
  deliveryNoteNumber: ["deliveryNoteNumber", "challanNumber"],
  referencePoNumber: ["referencePoNumber", "poReference", "purchaseOrderReference"],
  referenceInvoiceNumber: ["referenceInvoiceNumber", "invoiceReference"],
  eWayBillNumber: ["eWayBillNumber", "ewayBillNumber", "ewayNumber"],
  weighmentNumber: ["weighmentNumber", "weighmentReceiptNumber", "weighmentSlipNumber"],
  weighbridgeName: ["weighbridgeName", "weighBridgeName", "weightBridgeName"],
  lorryReceiptNumber: ["lorryReceiptNumber", "lrNumber", "lorryNumber", "transportReceiptNumber", "consignmentNumber"],
  certificateNumber: ["certificateNumber", "testCertificateNumber", "mtcNumber", "mtrNumber"],
  certificateDate: ["certificateDate", "testCertificateDate", "mtcDate", "certificateIssuedDate"],
  permitNumber: ["permitNumber", "authorisationNumber", "authorizationNumber"],
  permitType: ["permitType", "authorizationType", "permitClass"],
  licenseNumber: ["licenseNumber", "licenceNumber", "drivingLicenseNumber", "drivingLicenceNumber"],
  chassisNumber: ["chassisNumber", "vin", "vehicleIdentificationNumber"],
  engineNumber: ["engineNumber", "motorNumber"],
  vehicleClass: ["vehicleClass", "vehicleType"],
  documentDate: ["documentDate", "invoiceDate", "poDate", "receiptDate", "deliveryDate"],
  ackDate: ["ackDate", "acknowledgementDate", "acknowledgmentDate"],
  transactionDate: ["transactionDate", "transactionTime", "transactionDateTime", "paymentDate", "statementDate"],
  validityDate: ["validityDate", "permitValidityDate", "licenseValidityDate", "licenceValidityDate", "registrationValidityDate"],
  dateOfBirth: ["dateOfBirth", "dob", "birthDate"],
  currency: ["currency"],
  subtotal: ["subtotal", "subTotal", "taxableAmount"],
  taxAmount: ["taxAmount", "tax", "gstAmount"],
  totalAmount: ["totalAmount", "grandTotal", "documentTotal"],
  paidAmount: ["paidAmount", "amountPaid", "paidTollAmount", "tollAmount", "amountReceived", "receivedAmount"],
  statementAmount: ["statementAmount", "availableBalance", "availableBal", "avblBal", "balance", "debitAmount", "creditAmount", "transactionAmount"],
  freightAmount: ["freightAmount", "freight", "transportCharge"],
  advanceAmount: ["advanceAmount", "advancePaid"],
  toPayAmount: ["toPayAmount", "toPay", "ttbAmount"],
  itemDescription: ["itemDescription", "description", "productDescription"],
  materialGrade: ["materialGrade", "grade", "steelGrade"],
  itemQuantity: ["itemQuantity", "quantity", "qty"],
  unit: ["unit", "uom"],
  hsnSac: ["hsnSac", "hsn", "sac", "hsnCode"],
  batchNumber: ["batchNumber", "batchNo", "lotNumber"],
  heatNumber: ["heatNumber", "heatNo", "castLotNo"],
  vehicleNumber: ["vehicleNumber", "truckNumber", "lorryNumber", "vehicleNo", "truckNo"],
  registrationNumber: ["registrationNumber", "registrationNo", "rcNumber", "regnNumber"],
  ownerName: ["ownerName", "registeredOwnerName"],
  transporterName: ["transporterName", "transporter", "transportName", "carrierName"],
  driverName: ["driverName", "licenceHolderName", "licenseHolderName"],
  holderName: ["holderName", "nameOnCard", "panHolderName"],
  fatherName: ["fatherName", "fatherOrSpouseName"],
  panNumber: ["panNumber", "panNo"],
  fuelType: ["fuelType"],
  grossWeight: ["grossWeight", "grossWt"],
  tareWeight: ["tareWeight", "tareWt"],
  netWeight: ["netWeight", "netWt"],
  bankName: ["bankName"],
  accountNumber: ["accountNumber", "accountNo"],
  irnNumber: ["irnNumber", "irn"],
  ackNumber: ["ackNumber", "acknowledgementNumber", "acknowledgmentNumber"],
  transactionReference: ["transactionReference", "utrNumber", "referenceNumber", "paymentReference"],
  fastagReference: ["fastagReference", "fastagId", "tagId", "tagNumber", "tag", "transactionId"],
  fastagStatementReference: ["fastagStatementReference", "statementReferenceNumber", "statementReference"],
  fastagCustomerId: ["fastagCustomerId", "customerId", "customerID"],
  fastagCustomerName: ["fastagCustomerName", "customerName", "tagCustomerName"],
  statementPeriod: ["statementPeriod", "period"],
  statementDate: ["statementDate"],
  openingBalance: ["openingBalance", "openingBal"],
  creditAmount: ["creditAmount", "credit", "totalCredit"],
  debitAmount: ["debitAmount", "debit", "totalDebit"],
  closingBalance: ["closingBalance", "closingBal"],
  tripCount: ["tripCount", "totalTrips"],
  tollTransactionSummary: ["tollTransactionSummary", "transactionSummary", "tripSummary"],
  tollPlaza: ["tollPlaza", "plazaName", "tollLocation"],
  dispatchFrom: ["dispatchFrom", "originAddress", "dispatchAddress"],
  shipTo: ["shipTo", "deliveryAddress", "consigneeAddress"],
  routeFrom: ["routeFrom", "origin", "fromLocation"],
  routeTo: ["routeTo", "destination", "toLocation"],
  mapLocation: ["mapLocation", "address", "registeredAddress", "holderAddress"],
  photoTimestamp: ["photoTimestamp", "captureTimestamp", "evidenceTimestamp"],
  evidenceDescription: ["evidenceDescription", "photoDescription", "observation"],
  hasAuthorizedSignature: ["hasAuthorizedSignature", "authorizedSignature", "authorisedSignature", "signaturePresent", "hasSignature"],
  hasVendorStamp: ["hasVendorStamp", "vendorStamp", "supplierStamp", "sellerStamp", "stampPresent"],
  hasStoreStamp: ["hasStoreStamp", "storeStamp", "receivingStoreStamp", "warehouseStamp"],
  hasStoreSignature: ["hasStoreSignature", "storeSignature", "receivingSignature", "warehouseSignature"],
  hasGateStamp: ["hasGateStamp", "gateStamp", "gateEntryStamp", "securityStamp"],
};

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    const trimmed = raw.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    const jsonString = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
    return JSON.parse(jsonString) as T;
  } catch {
    return fallback;
  }
}

function toText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((entry) => toText(entry)).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    return Object.values(value).map((entry) => toText(entry)).filter(Boolean).join("\n");
  }
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatDocType(docType: DocType) {
  return docType === "Unknown" ? "Document" : docType;
}

function getAllowedFieldKeysForDocType(docType: DocType) {
  const docTypeFieldKeys = getFieldKeysForDocType(docType);
  return docTypeFieldKeys.length > 0 ? docTypeFieldKeys : ALL_ALLOWED_FIELD_KEYS;
}

function getLineItemExtractionInstruction(docType: DocType) {
  if (!isCommercialDocType(docType)) {
    return "";
  }

  return (
    "Also extract every commercial table row into a top-level lineItems array. " +
    "Each line item may contain lineNumber, itemCode, description, hsnSac, quantity, unit, rate, discountPercent, netRate, taxableAmount, cgstRate, cgstAmount, sgstRate, sgstAmount, igstRate, igstAmount, taxRate, taxAmount, lineTotal, referencePoLineNumber, and rawText. " +
    "Preserve one entry per visible PO/invoice row; do not merge different rows or sum unlike units. Use rawText for the original row text when OCR is uncertain. "
  );
}

function getDocumentSpecificExtractionInstruction(docType: DocType) {
  switch (docType) {
    case "PAN Card":
      return (
        "For PAN Card documents, prioritize panNumber, holderName, fatherName, and dateOfBirth. " +
        "PAN number is a 10-character Indian PAN like ABCDE1234F; do not leave it blank if visible. "
      );
    case "Driving Licence":
      return (
        "For Driving Licence documents, prioritize licenseNumber, driverName, dateOfBirth, validityDate, and mapLocation/address. " +
        "The licence number may be labelled DL No, Licence No, License No, or DL Number. "
      );
    case "Vehicle Registration Certificate":
      return (
        "For Vehicle Registration Certificate documents, prioritize registrationNumber, vehicleNumber, ownerName, chassisNumber, engineNumber, vehicleClass, fuelType, validityDate, and address. "
      );
    case "Weighment Slip":
      return (
        "For Weighment Slip documents, prioritize vehicleNumber/lorry number, grossWeight, tareWeight, netWeight, weighmentNumber, weighbridgeName, and authorized signature presence. " +
        "Read Indian vehicle numbers carefully from the image; distinguish letters from similar-looking digits, especially G/9, L/1, O/0, and S/5. "
      );
    default:
      return "";
  }
}

function mapFields(fields: Record<string, unknown>, docType?: DocType): Partial<Record<FieldKey, string>> {
  const result: Partial<Record<FieldKey, string>> = {};
  const allowedFieldKeys = docType ? getAllowedFieldKeysForDocType(docType) : ALL_ALLOWED_FIELD_KEYS;

  allowedFieldKeys.forEach((fieldKey) => {
    const aliases = FIELD_MAPPINGS[fieldKey] ?? [];
    for (const alias of aliases) {
      const value = fields[alias];
      const normalizedValue = normalizeFieldValue(value);
      if (normalizedValue) {
        result[fieldKey] = normalizedValue;
        break;
      }
    }
  });

  return omitIgnoredFields(result) as Partial<Record<FieldKey, string>>;
}

function mergeFieldRecords(
  primary: Partial<Record<FieldKey, string>>,
  fallback: Partial<Record<FieldKey, string>>
) {
  return {
    ...fallback,
    ...Object.fromEntries(
      Object.entries(primary).filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    ),
  } as Partial<Record<FieldKey, string>>;
}

function mergeExtractedDocs(primary: CaseDoc, fallback: CaseDoc): CaseDoc {
  return {
    ...primary,
    fields: mergeFieldRecords(primary.fields, fallback.fields),
    lineItems: primary.lineItems?.length ? primary.lineItems : fallback.lineItems,
    md: primary.md?.trim() ? primary.md : fallback.md,
  };
}

function countMeaningfulFields(fields: Partial<Record<FieldKey, string>>) {
  return Object.values(fields).filter((value) => value !== undefined && value !== null && String(value).trim()).length;
}

function isWeakExtraction(doc: CaseDoc) {
  const fields = doc.fields ?? {};
  const meaningfulFieldCount = countMeaningfulFields(fields);

  switch (doc.type) {
    case "PAN Card":
      return !fields.panNumber && !fields.holderName;
    case "Driving Licence":
      return !fields.licenseNumber && !fields.driverName;
    case "Vehicle Registration Certificate":
      return !fields.registrationNumber && !fields.vehicleNumber && !fields.ownerName;
    case "FASTag Toll Proof":
      return !fields.vehicleNumber && !fields.fastagReference && !fields.tollTransactionSummary;
    case "E-Way Bill":
      return !fields.eWayBillNumber && !fields.vehicleNumber;
    case "Tax Invoice":
    case "Invoice":
      return !fields.invoiceNumber && !fields.vendorName && !fields.buyerName && !fields.totalAmount;
    case "Weighment Slip":
      return !fields.netWeight && !fields.grossWeight && !fields.vehicleNumber;
    case "Lorry Receipt":
      return !fields.lorryReceiptNumber && !fields.vehicleNumber && !fields.transporterName;
    default:
      return doc.type !== "Unknown" && meaningfulFieldCount === 0;
  }
}

function normalizeFieldValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    return text || undefined;
  }
  if (Array.isArray(value)) {
    const text = value
      .map((entry) => {
        if (entry && typeof entry === "object") {
          const record = entry as Record<string, unknown>;
          const parts = [
            normalizeFieldValue(record.date ?? record.dateTime ?? record.transactionDate),
            normalizeFieldValue(record.plaza ?? record.tollPlaza ?? record.location),
            normalizeFieldValue(record.amount ?? record.debitAmount ?? record.paidAmount),
          ].filter(Boolean);
          return parts.length ? parts.join(" - ") : normalizeFieldValue(record.description ?? record.summary);
        }
        return normalizeFieldValue(entry);
      })
      .filter(Boolean)
      .join("\n");
    return text || undefined;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const text = normalizeFieldValue(record.value ?? record.text ?? record.summary ?? record.description);
    if (text) return text;
    const fallback = Object.entries(record)
      .map(([key, entry]) => `${key}: ${normalizeFieldValue(entry) ?? ""}`.trim())
      .filter((entry) => !entry.endsWith(":"))
      .join(", ");
    return fallback || undefined;
  }
  const text = String(value).trim();
  return text || undefined;
}

function cleanEWayAddress(value?: string) {
  const cleaned = value
    ?.replace(/\s+/g, " ")
    .replace(/\b(Address\s+Details|Dispatch\s+From|Ship\s+To|GSTIN|State|Pin\s*Code)\b\s*:*/gi, " ")
    .replace(/^[\s:;,\-.]+/, "")
    .replace(/[\s,.;:-]+$/, "")
    .trim();
  return cleaned || undefined;
}

function extractEWayBillAddresses(visibleText: string): Partial<Record<FieldKey, string>> {
  const text = visibleText.replace(/\s+/g, " ").trim();
  const match = text.match(/(?:Address\s+Details\s*)?(?:[:：]\s*)?(?:Dispatch\s+From|Dispatched\s+From)\s*[:：]?\s*(.+?)\s*(?:Ship\s+To|Ship-to)\s*[:：]?\s*(.+?)(?=\s*(?:Vehicle\s+Details|Part\s+B|Item\s+Details|Total|$))/i);
  if (!match) return {};
  return {
    dispatchFrom: cleanEWayAddress(match[1]),
    shipTo: cleanEWayAddress(match[2]),
  };
}

function applyEWayBillAddressFallback(
  fields: Partial<Record<FieldKey, string>>,
  docType: DocType,
  visibleText: string
) {
  if (docType !== "E-Way Bill" || !visibleText.trim()) return fields;
  const addresses = extractEWayBillAddresses(visibleText);
  return {
    ...fields,
    ...(fields.dispatchFrom || !addresses.dispatchFrom ? {} : { dispatchFrom: addresses.dispatchFrom }),
    ...(fields.shipTo || !addresses.shipTo ? {} : { shipTo: addresses.shipTo }),
  };
}

function extractFirstMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

function extractFastagTransactions(visibleText: string) {
  const lines = visibleText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const entries: Array<{ dateTime: string; plaza: string; lane?: string; amount: string }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const dateTime = lines[index].match(/\d{2}[-/]\d{2}[-/]\d{4}\s+\d{2}:\d{2}:\d{2}/)?.[0];
    if (!dateTime) continue;

    const block: string[] = [lines[index]];
    for (let next = index + 1; next < lines.length; next += 1) {
      if (/\d{2}[-/]\d{2}[-/]\d{4}\s+\d{2}:\d{2}:\d{2}/.test(lines[next])) break;
      block.push(lines[next]);
    }

    const blockText = block.join(" ");
    if (!/Plaza\s+Name/i.test(blockText)) continue;

    const plaza = blockText
      .match(/Plaza\s+Name\s*:?\s*([A-Za-z][A-Za-z0-9 ()]+?)(?=\s*-\s*Lane|\s+Lane\s+ID|\s+0\.00|\s+\/?\d{8,}|$)/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim();
    if (!plaza) continue;

    const lane = blockText.match(/Lane\s+ID\s*:?\s*([A-Z0-9 ]+?)(?=\s+0\.00|\s+\d{1,3}(?:,\d{3})*(?:\.\d{2})|$)/i)?.[1]?.replace(/\s+/g, " ").trim();
    const amounts = [...blockText.matchAll(/\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/g)].map((match) => match[0]);
    const amount = amounts.at(-1);
    if (!amount) continue;

    entries.push({ dateTime, plaza, lane, amount });
  }

  return entries;
}

function extractFastagDetails(visibleText: string): Partial<Record<FieldKey, string>> {
  const compact = visibleText.replace(/\s+/g, " ").trim();
  if (!compact) return {};

  const summaryMatch = compact.match(
    /(\d{6,})\s+([A-Z]{2}\d{2}[A-Z]{1,3}\d{4})\s+\S+\s+(\d+)\s+([\d,.]+)\s+([\d,.]+)\s+-?\s*([\d,.]+)\s+([\d,.]+)/i
  );
  const tagVehicleBlock = compact.match(/Tag\s+Account\s+No\.\s+Licence\s+Plate\s+No\..*?(\d{6,})\s+([A-Z]{2}\d{2}[A-Z]{1,3}\d{4})/i);
  const vehicleTagMatch = compact.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{1,4}\d{3,4})\s*[-–]\s*(\d{6,})\b/i);
  const paymentMatch = compact.match(/\bPayment\b.*?([\d,]+\.\d{2})\s+0\.00/i);
  const transactionRows = extractFastagTransactions(visibleText);
  const transactionSummary = transactionRows
    .slice(0, 12)
    .map((entry) => {
      const lane = entry.lane ? ` Lane ID:${entry.lane}` : "";
      return `${entry.dateTime} Plaza Name: ${entry.plaza}${lane} Amount (DR) ${entry.amount}`;
    })
    .join("\n");
  const statementDate = extractFirstMatch(compact, /Statement\s+Date\s*:?\s*(\d{2}[-/]\d{2}[-/]\d{4})/i);
  const statementReference = (
    extractFirstMatch(compact, /Statement\s+Reference\s+Number\s+([A-Z0-9/.-]+)/i) ??
    extractFirstMatch(compact, /Statement\s+Reference\s+(?:Number\s+)?([A-Z0-9/.-]+)/i)
  )?.replace(/t/gi, "/");
  const customerId = extractFirstMatch(compact, /Customer\s+[Il1]?D\s*:?\s*(?:[A-Z0-9/.-]+\s+)?(\d{7,})/i);
  const customerName = [...compact.matchAll(/Name\s*:\s*([A-Z][A-Z .'-]+?)(?=\s+(?:Branch|Statement\s+Period|Bill\s+From|GSTIN|Address:|supply:))/gi)]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .find((name) => !/ICICI|BANK|BRANCH/i.test(name)) ??
    extractFirstMatch(compact, /Address\s*:\s*([A-Z][A-Z .'-]+?)\s+\d{1,5}[,\s]/i);

  return {
    fastagStatementReference: statementReference,
    fastagCustomerId: customerId,
    fastagCustomerName: customerName,
    statementPeriod: extractFirstMatch(compact, /Statement\s+Period\s*:?\s*(\d{2}[-/]\d{2}[-/]\d{4}\s+to\s+\d{2}[-/]\d{2}[-/]\d{4})/i),
    statementDate,
    transactionDate: statementDate,
    ...(summaryMatch
      ? {
          fastagReference: summaryMatch[1],
          vehicleNumber: summaryMatch[2],
          tripCount: summaryMatch[3],
          openingBalance: summaryMatch[4],
          creditAmount: summaryMatch[5],
          debitAmount: summaryMatch[6].replace(/^-/, ""),
          closingBalance: summaryMatch[7],
          statementAmount: summaryMatch[7],
        }
      : {}),
    ...(!summaryMatch && tagVehicleBlock ? { fastagReference: tagVehicleBlock[1], vehicleNumber: tagVehicleBlock[2] } : {}),
    ...(!summaryMatch && !tagVehicleBlock && vehicleTagMatch ? { vehicleNumber: vehicleTagMatch[1], fastagReference: vehicleTagMatch[2] } : {}),
    ...(paymentMatch?.[1] ? { paidAmount: paymentMatch[1] } : {}),
    ...(transactionRows[0]?.plaza ? { tollPlaza: transactionRows[0].plaza } : {}),
    ...(transactionSummary ? { tollTransactionSummary: transactionSummary } : {}),
  };
}

function applyFastagDetailsFallback(
  fields: Partial<Record<FieldKey, string>>,
  docType: DocType,
  visibleText: string
) {
  if (docType !== "FASTag Toll Proof" || !visibleText.trim()) return fields;
  const details = extractFastagDetails(visibleText);
  return Object.entries(details).reduce(
    (acc, [key, value]) => {
      if (value) acc[key as FieldKey] = value;
      return acc;
    },
    { ...fields } as Partial<Record<FieldKey, string>>
  );
}

function inferDocTypeFromFilename(fileName: string): DocType {
  const lower = fileName.toLowerCase();
  if (lower.includes("amended") && lower.includes("po")) return "Amended Purchase Order";
  if (lower.includes("test") || lower.includes("mtc") || lower.includes("mtr")) return "Material Test Certificate";
  if (lower.includes("licence") || lower.includes("license") || lower.includes("dl")) return "Driving Licence";
  if (lower.includes("permit") || lower.includes("authorisation") || lower.includes("authorization")) return "Transport Permit";
  if (lower.includes("photo") || lower.includes("camera")) return "Photo Evidence";
  if (lower.includes("tax") && lower.includes("invoice")) return "Tax Invoice";
  if (lower.includes("eway") || lower.includes("e-way")) return "E-Way Bill";
  if (lower.includes("weighment") || lower.includes("weight")) return "Weighment Slip";
  if (lower.includes("lorry") || lower.includes("consignment") || lower.includes("challan") || lower.includes("lr")) return "Lorry Receipt";
  if (lower.includes("rc") || lower.includes("registration")) return "Vehicle Registration Certificate";
  if (lower.includes("pan")) return "PAN Card";
  if (lower.includes("fastag") || lower.includes("toll")) return "FASTag Toll Proof";
  if (lower.includes("bank") && lower.includes("statement")) return "Bank Statement";
  if (lower.includes("map")) return "Map Printout";
  if (lower.includes("payment") || lower.includes("sms")) return "Payment Screenshot";
  if (lower.includes("purchase-order") || lower.includes("purchase_order") || lower.includes("po")) return "Purchase Order";
  if (lower.includes("invoice")) return "Tax Invoice";
  if (lower.includes("receipt")) return "Receipt";
  if (lower.includes("delivery-note") || lower.includes("delivery_note") || lower.includes("delivery note")) return "Delivery Note";
  if (lower.includes("challan")) return "Delivery Challan";
  if (lower.includes("delivery")) return "Delivery Note";
  return "Unknown";
}

function normaliseDocType(raw?: string): DocType {
  if (!raw) return "Unknown";
  const value = raw.toLowerCase();
  if (value.includes("amended purchase order")) return "Amended Purchase Order";
  if (value.includes("material test") || value.includes("test certificate") || value.includes("quality certificate") || value.includes("mill test")) return "Material Test Certificate";
  if (value.includes("driving licence") || value.includes("driving license") || value.includes("licence")) return "Driving Licence";
  if (value.includes("transport permit") || value.includes("authorisation") || value.includes("authorization") || value.includes("permit")) return "Transport Permit";
  if (value.includes("photo") || value.includes("camera") || value.includes("loading") || value.includes("unloading")) return "Photo Evidence";
  if (value.includes("tax invoice")) return "Tax Invoice";
  if (value.includes("e-way") || value.includes("eway")) return "E-Way Bill";
  if (value.includes("weighment") || value.includes("weighbridge")) return "Weighment Slip";
  if (value.includes("lorry receipt") || value.includes("transport receipt") || value.includes("consignment")) return "Lorry Receipt";
  if (value.includes("vehicle registration") || value.includes("registration certificate") || value.includes("rc book")) return "Vehicle Registration Certificate";
  if (value.includes("pan card") || value === "pan") return "PAN Card";
  if (value.includes("fastag") || value.includes("toll")) return "FASTag Toll Proof";
  if (value.includes("bank statement")) return "Bank Statement";
  if (value.includes("map")) return "Map Printout";
  if (value.includes("payment screenshot") || value.includes("payment proof") || value.includes("sms")) return "Payment Screenshot";
  if (value.includes("purchase order") || value === "po") return "Purchase Order";
  if (value.includes("invoice")) return "Invoice";
  if (value.includes("receipt")) return "Receipt";
  if (value.includes("delivery challan") || value.includes("challan")) return "Delivery Challan";
  if (value.includes("delivery")) return "Delivery Note";
  return "Unknown";
}

function buildMarkdown(doc: CaseDoc, visibleTextPages: string[] = []) {
  const lines = [`# ${doc.title}`, "", `Source: **${doc.sourceHint ?? "uploaded"}**`, ""];
  for (const key of getAllowedFieldKeysForDocType(doc.type)) {
    const value = doc.fields[key];
    if (value) {
      if (!lines.includes("## Extracted Fields")) {
        lines.push("## Extracted Fields", "");
      }
      lines.push(`- **${FIELD_LABELS[key]}**: ${value}`);
    }
  }

  if (doc.lineItems?.length) {
    lines.push("", "## Line Items", "");
    doc.lineItems.forEach((item, index) => {
      const label = item.lineNumber ? `Line ${item.lineNumber}` : `Line ${index + 1}`;
      const parts = [
        item.itemCode,
        item.description,
        item.hsnSac ? `HSN ${item.hsnSac}` : "",
        item.quantity && item.unit ? `${item.quantity} ${item.unit}` : item.quantity,
        item.rate ? `rate ${item.rate}` : "",
        item.lineTotal ? `total ${item.lineTotal}` : "",
      ].filter(Boolean);
      lines.push(`- **${label}**: ${parts.join(" | ") || item.rawText || "Extracted row"}`);
    });
  }

  const visibleText = visibleTextPages.map((text) => text.trim()).filter(Boolean);
  if (visibleText.length) {
    lines.push("", "## Visible Text", "");
    visibleText.forEach((text, index) => {
      if (visibleText.length > 1) {
        lines.push(`### Page ${index + 1}`, "");
      }
      lines.push(text, "");
    });
  }

  return lines.join("\n").trim();
}

function fallbackDoc(fileName: string, docType?: DocType, options?: { pages?: number; visibleTextPages?: string[] }) {
  const resolvedType = docType && docType !== "Unknown" ? docType : inferDocTypeFromFilename(fileName);
  const fallback: CaseDoc = {
    id: `${resolvedType.toLowerCase().replace(/[^a-z0-9]+/g, "_")}-${Date.now()}`,
    type: resolvedType,
    title: `${formatDocType(resolvedType)} — ${fileName}`,
    pages: options?.pages ?? 1,
    fields: omitIgnoredFields({}) as Partial<Record<FieldKey, string>>,
    md: "",
    sourceHint: fileName,
  };
  fallback.md = buildMarkdown(fallback, options?.visibleTextPages ?? []);
  return fallback;
}

function getFileMimeType(fileName: string, mimeType: string | null) {
  if (mimeType) return mimeType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function bufferToDataUrl(data: Uint8Array, mimeType: string) {
  return `data:${mimeType};base64,${Buffer.from(data).toString("base64")}`;
}

function hasMeaningfulTextPages(textPages: string[]) {
  return textPages.some((page) => page.replace(/\s+/g, "").length > 20);
}

function renderedPageNumber(fileName: string) {
  const match = fileName.match(/-(\d+)\.png$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function renderPdfToImagePages(data: Uint8Array, options?: { maxPages?: number }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "packet-pdf-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "page");
  const maxPages = options?.maxPages ?? PDF_RENDER_MAX_PAGES;

  try {
    fs.writeFileSync(inputPath, Buffer.from(data));
    await execFileAsync("pdftoppm", [
      "-r",
      String(PDF_RENDER_DPI),
      "-png",
      "-f",
      "1",
      "-l",
      String(maxPages),
      inputPath,
      outputPrefix,
    ]);

    return fs
      .readdirSync(tmpDir)
      .filter((fileName) => fileName.startsWith("page-") && fileName.endsWith(".png"))
      .sort((left, right) => renderedPageNumber(left) - renderedPageNumber(right))
      .map((fileName) => {
        const bytes = fs.readFileSync(path.join(tmpDir, fileName));
        return `data:image/png;base64,${bytes.toString("base64")}`;
      });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function extractPdfTextPages(data: Uint8Array) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if ("GlobalWorkerOptions" in pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  }
  const pdf = await (pdfjsLib as typeof pdfjsLib & {
    getDocument(source: Record<string, unknown>): {
      promise: Promise<{
        numPages: number;
        getPage(pageNumber: number): Promise<{
          getTextContent(): Promise<{
            items: Array<{ str?: string }>;
          }>;
        }>;
      }>;
    };
  }).getDocument({
    data,
    disableWorker: true,
  }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(text);
  }

  return pages;
}

async function classifyDocumentFromImage(image: string, fileName = ""): Promise<DocType> {
  const inferred = inferDocTypeFromFilename(fileName);
  if (!image.startsWith("data:image/")) {
    return inferred;
  }

  const raw = await callOpenRouter(
    [
      {
        role: "system",
        content: `Classify procurement packet pages. Return only JSON like {"documentType":"Purchase Order"} using one of: ${SUPPORTED_DOC_TYPES.join(", ")}.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Classify this file: ${fileName}` },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
    { expectJson: true }
  );

  const parsed = safeJsonParse<{ documentType?: string }>(raw, {});
  const classified = normaliseDocType(parsed.documentType);
  return classified === "Unknown" ? inferred : classified;
}

async function classifyDocumentFromText(textPages: string[], fileName = ""): Promise<DocType> {
  const inferred = inferDocTypeFromFilename(fileName);
  const visibleText = textPages.map((page, index) => `Page ${index + 1}: ${page}`).join("\n").slice(0, 12000);

  if (!visibleText.trim()) {
    return inferred;
  }

  const raw = await callOpenRouter(
    [
      {
        role: "system",
        content: `Classify procurement packet text. Return only JSON like {"documentType":"Purchase Order"} using one of: ${SUPPORTED_DOC_TYPES.join(", ")}.`,
      },
      {
        role: "user",
        content: `File name: ${fileName}\n\nVisible text:\n${visibleText}`,
      },
    ],
    { expectJson: true }
  );

  const parsed = safeJsonParse<{ documentType?: string }>(raw, {});
  const classified = normaliseDocType(parsed.documentType);
  return classified === "Unknown" ? inferred : classified;
}

type PdfDocumentGroup = {
  documentType: DocType;
  pageStart: number;
  pageEnd: number;
  confidence?: number;
};

function pageRangeLabel(group: PdfDocumentGroup) {
  return group.pageStart === group.pageEnd
    ? `page ${group.pageStart}`
    : `pages ${group.pageStart}-${group.pageEnd}`;
}

function normalizePageNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : NaN;
}

function normalizePdfDocumentGroups(
  rawGroups: unknown,
  pageCount: number,
  fileName: string
): PdfDocumentGroup[] {
  const inferred = inferDocTypeFromFilename(fileName);
  const groups = Array.isArray(rawGroups) ? rawGroups : [];
  const parsedGroups = groups
    .map((entry): PdfDocumentGroup | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const pageValues = Array.isArray(record.pages) ? record.pages : [];
      const pageStart = normalizePageNumber(record.pageStart ?? record.startPage ?? record.fromPage ?? pageValues[0]);
      const pageEnd = normalizePageNumber(record.pageEnd ?? record.endPage ?? record.toPage ?? pageValues[1] ?? pageValues[0]);
      if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd)) return null;

      const group: PdfDocumentGroup = {
        documentType: normaliseDocType(String(record.documentType ?? record.type ?? record.docType ?? "")),
        pageStart: Math.max(1, Math.min(pageCount, pageStart)),
        pageEnd: Math.max(1, Math.min(pageCount, pageEnd)),
      };

      if (typeof record.confidence === "number") {
        group.confidence = record.confidence;
      }

      return group;
    })
    .filter((entry): entry is PdfDocumentGroup => entry !== null)
    .map((entry): PdfDocumentGroup => {
      const pageStart = Math.min(entry.pageStart, entry.pageEnd);
      const pageEnd = Math.max(entry.pageStart, entry.pageEnd);
      return { ...entry, pageStart, pageEnd };
    })
    .sort((left, right) => left.pageStart - right.pageStart || left.pageEnd - right.pageEnd);

  if (pageCount <= 0) {
    return [];
  }

  if (!parsedGroups.length) {
    return [{ documentType: inferred, pageStart: 1, pageEnd: pageCount }];
  }

  const seen = new Set<string>();
  const normalized = parsedGroups.filter((group) => {
    const key = `${group.documentType}:${group.pageStart}:${group.pageEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const isPageCovered = (pageNumber: number) =>
    normalized.some((group) => group.pageStart <= pageNumber && group.pageEnd >= pageNumber);

  let cursor = 1;
  while (cursor <= pageCount) {
    if (isPageCovered(cursor)) {
      cursor += 1;
      continue;
    }

    let gapEnd = cursor;
    while (gapEnd + 1 <= pageCount && !isPageCovered(gapEnd + 1)) {
      gapEnd += 1;
    }

    normalized.push({
      documentType: "Unknown",
      pageStart: cursor,
      pageEnd: gapEnd,
    });
    cursor = gapEnd + 1;
  }

  normalized.sort((left, right) => left.pageStart - right.pageStart || left.pageEnd - right.pageEnd);

  return normalized.length ? normalized : [{ documentType: inferred, pageStart: 1, pageEnd: pageCount }];
}

function isCollapsedPdfSplit(groups: PdfDocumentGroup[], pageCount: number) {
  return (
    pageCount > 1 &&
    groups.length === 1 &&
    groups[0]?.pageStart === 1 &&
    groups[0]?.pageEnd === pageCount
  );
}

function compactConsecutivePdfGroups(groups: PdfDocumentGroup[]) {
  const sorted = [...groups].sort((left, right) => left.pageStart - right.pageStart || left.pageEnd - right.pageEnd);
  const compacted: PdfDocumentGroup[] = [];

  for (const group of sorted) {
    const previous = compacted[compacted.length - 1];
    if (
      previous &&
      previous.documentType === group.documentType &&
      previous.pageEnd + 1 === group.pageStart
    ) {
      previous.pageEnd = group.pageEnd;
      previous.confidence =
        typeof previous.confidence === "number" && typeof group.confidence === "number"
          ? Math.min(previous.confidence, group.confidence)
          : previous.confidence ?? group.confidence;
      continue;
    }

    compacted.push({ ...group });
  }

  return compacted;
}

async function splitPdfPagesIndividually(params: {
  fileName: string;
  textPages: string[];
  pageImages: string[];
  pageCount: number;
}) {
  const pageGroups: PdfDocumentGroup[] = [];
  const systemPrompt =
    `Classify one page from a procurement packet PDF. Return only JSON with a top-level "documents" array. ` +
    `Each item must contain documentType and confidence. Use only these documentType values: ${SUPPORTED_DOC_TYPES.join(", ")}. ` +
    `Use the rendered page image as the source of truth when available; use text only as supporting context. ` +
    `If this one page visibly contains multiple separate documents or cards, return multiple records. ` +
    `Do not infer document type from the file name when the page image/text shows a different document.`;

  for (let index = 0; index < params.pageCount; index += 1) {
    const pageNumber = index + 1;
    const pageText = params.textPages[index] || "[No text extracted]";
    const pageImage = params.pageImages[index];

    const raw = pageImage
      ? await callOpenRouter(
          [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    `File name: ${params.fileName}. Classify rendered page ${pageNumber} of ${params.pageCount}.\n\n` +
                    `OCR text for this page:\n${pageText.slice(0, 8000)}`,
                },
                { type: "image_url" as const, image_url: { url: pageImage } },
              ],
            },
          ],
          {
            expectJson: true,
            model: getQualityExtractionModel(),
            reasoning: getQualityExtractionReasoning(),
          }
        )
      : await callOpenRouter(
          [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content:
                `File name: ${params.fileName}. Classify page ${pageNumber} of ${params.pageCount}.\n\n` +
                `Visible text:\n${pageText.slice(0, 12000)}`,
            },
          ],
          {
            expectJson: true,
            model: getQualityExtractionModel(),
            reasoning: getQualityExtractionReasoning(),
          }
        );

    const parsed = safeJsonParse<{ documents?: unknown }>(raw, {});
    const pageDocuments = Array.isArray(parsed.documents) ? parsed.documents : [];
    const normalizedPageGroups = normalizePdfDocumentGroups(
      pageDocuments.map((entry) =>
        entry && typeof entry === "object"
          ? {
              ...(entry as Record<string, unknown>),
              pageStart: pageNumber,
              pageEnd: pageNumber,
            }
          : entry
      ),
      params.pageCount,
      params.fileName
    ).filter((group) => group.pageStart === pageNumber && group.pageEnd === pageNumber);

    pageGroups.push(
      ...(normalizedPageGroups.length
        ? normalizedPageGroups
        : [{ documentType: "Unknown" as DocType, pageStart: pageNumber, pageEnd: pageNumber }])
    );
  }

  return compactConsecutivePdfGroups(pageGroups);
}

async function splitPdfIntoDocumentGroups(params: {
  fileName: string;
  textPages: string[];
  pageImages: string[];
}) {
  const pageCount = Math.max(params.textPages.length, params.pageImages.length);
  if (pageCount <= 1) {
    return [
      {
        documentType: params.textPages.some((page) => page.trim())
          ? await classifyDocumentFromText(params.textPages, params.fileName)
          : await classifyDocumentFromImage(params.pageImages[0] ?? "", params.fileName),
        pageStart: 1,
        pageEnd: 1,
      },
    ];
  }

  const hasText = hasMeaningfulTextPages(params.textPages);
  const systemPrompt =
    `You split uploaded procurement packet PDFs into separate documents. Return only JSON with a top-level "documents" array. ` +
    `Each item must contain documentType, pageStart, pageEnd, and confidence. Use only these documentType values: ${SUPPORTED_DOC_TYPES.join(", ")}. ` +
    `Group consecutive pages belonging to the same physical/logical document. Do not merge different document types just because they are in one PDF. ` +
    `If one scanned page visibly contains multiple separate cards/documents, output multiple records with the same pageStart and pageEnd. ` +
    `For example, one page may contain Vehicle Registration Certificate, Driving Licence, and PAN Card together; emit three records all pointing to that page. ` +
    `Do not invent PAN Card or Driving Licence records on later pages just because they appeared on an earlier multi-document scan. ` +
    `Pages showing camera overlays, vehicle loading/unloading photos, gate photos, or timestamped vehicle photos are Photo Evidence. ` +
    `Use PAN Card only when the page visibly contains Income Tax/Permanent Account Number/PAN card content. Use Driving Licence only when the page visibly contains a licence card.`;

  const pageTextSummary = params.textPages
    .map((page, index) => `Page ${index + 1} text:\n${page || "[No text extracted]"}`)
    .join("\n\n")
    .slice(0, 30000);

  if (!params.pageImages.length && !hasText) {
    return [{ documentType: inferDocTypeFromFilename(params.fileName), pageStart: 1, pageEnd: pageCount }];
  }

  const raw = params.pageImages.length
    ? await callOpenRouter(
        [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `File name: ${params.fileName}. There are ${pageCount} pages. Identify which document is on which pages. ` +
                  `Use the rendered page images as the source of truth; use the OCR text only as supporting context.\n\n${pageTextSummary}`,
              },
              ...params.pageImages.flatMap((image, index) => [
                { type: "text" as const, text: `Rendered page ${index + 1}` },
                { type: "image_url" as const, image_url: { url: image } },
              ]),
            ],
          },
        ],
        {
          expectJson: true,
          model: getQualityExtractionModel(),
          reasoning: getQualityExtractionReasoning(),
        }
      )
    : hasText
    ? await callOpenRouter(
        [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content:
              `File name: ${params.fileName}\n` +
              `There are ${params.textPages.length} pages. Identify which document is on which pages.\n\n` +
              pageTextSummary,
          },
        ],
        { expectJson: true }
      )
    : await callOpenRouter(
        [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `File name: ${params.fileName}. There are ${params.pageImages.length} rendered pages. Identify which document is on which pages.`,
              },
              ...params.pageImages.flatMap((image, index) => [
                { type: "text" as const, text: `Page ${index + 1}` },
                { type: "image_url" as const, image_url: { url: image } },
              ]),
            ],
          },
        ],
        { expectJson: true }
      );

  const parsed = safeJsonParse<{ documents?: unknown; groups?: unknown }>(raw, {});
  const normalized = normalizePdfDocumentGroups(parsed.documents ?? parsed.groups, pageCount, params.fileName);

  if (isCollapsedPdfSplit(normalized, pageCount)) {
    try {
      const pageLevelGroups = await splitPdfPagesIndividually({ ...params, pageCount });
      if (
        pageLevelGroups.length > 1 ||
        (pageLevelGroups.length === 1 && pageLevelGroups[0]?.documentType !== normalized[0]?.documentType)
      ) {
        return pageLevelGroups;
      }
    } catch (error) {
      console.warn("Page-level smart split fallback failed", error);
    }
  }

  return normalized;
}

async function extractPdfDocumentGroups(params: {
  fileName: string;
  textPages: string[];
  pageImages: string[];
  groups: PdfDocumentGroup[];
}) {
  const documents: CaseDoc[] = [];
  const hasText = hasMeaningfulTextPages(params.textPages);

  for (const group of params.groups) {
    const pageStartIndex = group.pageStart - 1;
    const pageEndIndex = group.pageEnd;
    const sourceHint = `${params.fileName} (${pageRangeLabel(group)})`;
    const groupFileName = sourceHint;
    const groupTextPages = params.textPages.slice(pageStartIndex, pageEndIndex);
    const groupPageImages = params.pageImages.slice(pageStartIndex, pageEndIndex);

    let document =
      groupPageImages.length
        ? await extractDataFromImagePages({
            fileName: groupFileName,
            pageImages: groupPageImages,
            documentType: group.documentType,
          })
        : hasText && groupTextPages.some((page) => page.trim())
          ? await extractDataFromTextPages({
              fileName: groupFileName,
              textPages: groupTextPages,
              documentType: group.documentType,
            })
          : fallbackDoc(groupFileName, group.documentType, {
              pages: Math.max(1, group.pageEnd - group.pageStart + 1),
              visibleTextPages: groupTextPages,
            });

    if (isWeakExtraction(document) && group.documentType !== "Unknown") {
      const qualityModel = getQualityExtractionModel();
      const qualityReasoning = getQualityExtractionReasoning();
      const retryDocument =
        groupPageImages.length
          ? await extractDataFromImagePages({
              fileName: groupFileName,
              pageImages: groupPageImages,
              documentType: group.documentType,
              model: qualityModel,
              reasoning: qualityReasoning,
              qualityRetry: true,
            })
          : hasText && groupTextPages.some((page) => page.trim())
          ? await extractDataFromTextPages({
              fileName: groupFileName,
              textPages: groupTextPages,
              documentType: group.documentType,
              model: qualityModel,
              reasoning: qualityReasoning,
              qualityRetry: true,
            })
          : null;

      if (retryDocument && !isWeakExtraction(retryDocument)) {
        document = mergeExtractedDocs(retryDocument, document);
      } else if (retryDocument) {
        document = mergeExtractedDocs(document, retryDocument);
      }
    }

    document.sourceHint = sourceHint;
    document.sourceFileName = params.fileName;
    document.pages = Math.max(1, group.pageEnd - group.pageStart + 1);
    documents.push(document);
  }

  return documents;
}

async function extractDataFromImagePages(params: {
  fileName: string;
  pageImages: string[];
  documentType: DocType;
  model?: string;
  reasoning?: ReturnType<typeof getQualityExtractionReasoning>;
  qualityRetry?: boolean;
}) {
  const allowedFieldKeys = getAllowedFieldKeysForDocType(params.documentType);
  const allowedFieldKeysText = allowedFieldKeys.join(", ");
  const extracted: Array<{ fields: Record<string, unknown>; lineItems: CommercialLineItem[]; visibleText: string }> = [];
  const lineItemInstruction = getLineItemExtractionInstruction(params.documentType);
  const documentSpecificInstruction = getDocumentSpecificExtractionInstruction(params.documentType);
  const qualityInstruction = params.qualityRetry
    ? "This is a quality retry because the first extraction was weak. Re-read the page carefully, including small text, IDs, stamps, QR-adjacent text, and rotated/cropped regions. Do not return empty fields when any requested value is visible. "
    : "";

  for (let index = 0; index < params.pageImages.length; index += 1) {
    const image = params.pageImages[index];
    const raw = await callOpenRouter(
      [
        {
          role: "system",
          content:
            `Extract structured fields and visible text from procurement, logistics, transport, vehicle KYC, FASTag, quality certificate, and photo-evidence documents and return only JSON with keys "fields", "lineItems", and "visibleText". ` +
            `This document is a ${params.documentType}. Use only these field keys for this document type: ${allowedFieldKeysText}. ` +
            "visibleText must be a raw OCR-style transcription of the important visible text on the page. " +
            qualityInstruction +
            documentSpecificInstruction +
            lineItemInstruction +
            "For stamp/signature presence fields, return only Yes, No, or Unclear. Use Yes only when the mark is visibly present, No only when the relevant area is visible and clearly absent, otherwise Unclear. " +
            "For FASTag Toll Proof documents, extract statement reference, customer ID/name, statement period/date, vehicle number, tag account number, trip count, opening/credit/debit/closing balances, recharge/payment amount, toll plaza, and a compact toll transaction summary using the canonical FASTag keys. " +
            "For seller-issued documents, vendorName is the issuing supplier/seller/consignor and buyerName is the receiving party. " +
            "For Purchase Order or Amended Purchase Order documents, vendorName is the supplier/vendor receiving the order and buyerName is the purchaser issuing the order.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Extract only clearly visible ${params.documentType} fields from ${params.fileName}.` },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      { expectJson: true, model: params.model, reasoning: params.reasoning }
    );

    const parsed = safeJsonParse<{ fields?: Record<string, unknown>; lineItems?: unknown; visibleText?: unknown; text?: unknown; ocrText?: unknown }>(raw, {});
    extracted.push({
      fields: parsed.fields ?? {},
      lineItems: sanitizeLineItems(parsed.lineItems).map((item) => ({ ...item, sourcePage: item.sourcePage ?? index + 1 })),
      visibleText: toText(parsed.visibleText) || toText(parsed.ocrText) || toText(parsed.text),
    });
  }

  const combinedFields = extracted.reduce((acc, current) => ({ ...acc, ...current.fields }), {});
  const lineItems = extracted.flatMap((page) => page.lineItems);
  const visibleTextPages = extracted.map((page) => page.visibleText).filter(Boolean);
  const visibleText = visibleTextPages.join("\n");
  const fields = applyFastagDetailsFallback(
    applyEWayBillAddressFallback(
      mapFields(combinedFields, params.documentType),
      params.documentType,
      visibleText
    ),
    params.documentType,
    visibleText
  );

  const doc: CaseDoc = {
    id: `${params.fileName}-${Date.now()}`,
    type: params.documentType,
    title: `${formatDocType(params.documentType)} — ${params.fileName}`,
    pages: params.pageImages.length,
    fields,
    lineItems,
    md: "",
    sourceHint: params.fileName,
    sourceFileName: params.fileName,
  };
  doc.md = buildMarkdown(doc, visibleTextPages);
  return doc;
}

async function extractDataFromTextPages(params: {
  fileName: string;
  textPages: string[];
  documentType: DocType;
  model?: string;
  reasoning?: ReturnType<typeof getQualityExtractionReasoning>;
  qualityRetry?: boolean;
}) {
  const allowedFieldKeys = getAllowedFieldKeysForDocType(params.documentType);
  const allowedFieldKeysText = allowedFieldKeys.join(", ");
  const lineItemInstruction = getLineItemExtractionInstruction(params.documentType);
  const documentSpecificInstruction = getDocumentSpecificExtractionInstruction(params.documentType);
  const qualityInstruction = params.qualityRetry
    ? "This is a quality retry because the first extraction was weak. Re-read the text carefully and do not return empty fields when any requested value is visible. "
    : "";
  const visibleText = params.textPages.map((page, index) => `Page ${index + 1}: ${page}`).join("\n\n");

  if (!visibleText.trim()) {
    return fallbackDoc(params.fileName, params.documentType, {
      pages: Math.max(1, params.textPages.length),
    });
  }

  const raw = await callOpenRouter(
    [
      {
        role: "system",
        content:
          `Extract structured fields from procurement packet text and return only JSON with keys "fields", "lineItems", and "visibleText". ` +
          `This document is a ${params.documentType}. Use only these field keys for this document type: ${allowedFieldKeysText}. ` +
          qualityInstruction +
          documentSpecificInstruction +
          lineItemInstruction +
          "For stamp/signature presence fields, return only Yes, No, or Unclear. Use Yes only when the text explicitly indicates a signature/stamp is present, No only when it explicitly indicates absence, otherwise Unclear. " +
          "Use only information present in the visible text. For seller-issued documents, vendorName is the issuing supplier and buyerName is the receiving party. " +
          "For Purchase Order or Amended Purchase Order documents, vendorName is the supplier/vendor receiving the order and buyerName is the purchaser issuing the order.",
      },
      {
        role: "user",
        content: `File name: ${params.fileName}\n\nVisible text:\n${visibleText.slice(0, 24000)}`,
      },
    ],
    { expectJson: true, model: params.model, reasoning: params.reasoning }
  );

  const parsed = safeJsonParse<{ fields?: Record<string, unknown>; lineItems?: unknown; visibleText?: unknown }>(raw, {});
  const fields = applyFastagDetailsFallback(
    applyEWayBillAddressFallback(
      mapFields(parsed.fields ?? {}, params.documentType),
      params.documentType,
      visibleText
    ),
    params.documentType,
    visibleText
  );
  const doc: CaseDoc = {
    id: `${params.fileName}-${Date.now()}`,
    type: params.documentType,
    title: `${formatDocType(params.documentType)} — ${params.fileName}`,
    pages: Math.max(1, params.textPages.length),
    fields,
    lineItems: sanitizeLineItems(parsed.lineItems),
    md: "",
    sourceHint: params.fileName,
    sourceFileName: params.fileName,
  };
  doc.md = buildMarkdown(doc, params.textPages);
  return doc;
}

function buildMismatchCopy(mismatch: Omit<Mismatch, "analysis" | "fixPlan">): Pick<Mismatch, "analysis" | "fixPlan"> {
  const lineItemLabels: Record<string, string> = {
    "lineItems.unmatchedInvoiceLine": "Invoice line item",
    "lineItems.uninvoicedPoLine": "PO line item",
    "lineItems.quantityExceeded": "Line item quantity",
    "lineItems.rateMismatch": "Line item rate",
    "lineItems.unitMismatch": "Line item unit",
  };
  const label = lineItemLabels[mismatch.field] ?? FIELD_LABELS[mismatch.field as FieldKey] ?? mismatch.field;
  return {
    analysis: `${label} does not reconcile across the uploaded documents. Review the packet before approval.`,
    fixPlan: `1. Confirm the correct ${label.toLowerCase()} from the source document.\n2. Correct or replace the inconsistent file.\n3. Run analysis again before accepting the case.`,
  };
}

export async function processStoredCaseFiles(params: {
  caseId: string;
  analysisMode?: CaseAnalysisMode;
  comparisonOptions?: unknown;
  onProgress?: (details: { progress: number; stage: string }) => Promise<void> | void;
}) {
  const supabase = createSupabaseAdminClient();
  const fieldConfiguration = await getPersistedPacketFieldConfiguration();
  const comparisonOptions = readComparisonOptions(params.comparisonOptions ?? DEFAULT_COMPARISON_OPTIONS);
  const analysisMode = params.analysisMode ?? "standard";

  const { data: files, error: filesError } = await supabase
    .from("packet_case_files")
    .select("id, original_name, storage_bucket, storage_path, mime_type")
    .eq("case_id", params.caseId)
    .order("created_at", { ascending: true });

  if (filesError) {
    throw filesError;
  }

  if (!files?.length) {
    throw new Error("No files found for this case.");
  }

  const documents: CaseDoc[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const bucket = file.storage_bucket || STORAGE_BUCKET;
    await params.onProgress?.({
      progress: Math.max(5, Math.round((index / files.length) * 70)),
      stage: `Reading ${file.original_name}`,
    });

    const download = await supabase.storage.from(bucket).download(file.storage_path);
    if (download.error) {
      throw download.error;
    }

    const bytes = new Uint8Array(await download.data.arrayBuffer());
    const mimeType = getFileMimeType(file.original_name, file.mime_type);

    let fileDocuments: CaseDoc[] = [];
    if (mimeType.startsWith("image/")) {
      await params.onProgress?.({
        progress: Math.max(10, Math.round((index / files.length) * 70)),
        stage: `Extracting ${file.original_name}`,
      });
      const image = bufferToDataUrl(bytes, mimeType);
      const documentType = await classifyDocumentFromImage(image, file.original_name);
      const document = await extractDataFromImagePages({
        fileName: file.original_name,
        pageImages: [image],
        documentType,
      });
      fileDocuments = [document];
    } else if (mimeType === "application/pdf") {
      const textPages = await extractPdfTextPages(bytes.slice());
      if (analysisMode === "smart_split") {
        await params.onProgress?.({
          progress: Math.max(10, Math.round((index / files.length) * 70)),
          stage: `Splitting ${file.original_name} into documents`,
        });

        let pageImages: string[] = [];
        try {
          pageImages = await renderPdfToImagePages(bytes, { maxPages: PDF_SMART_SPLIT_MAX_PAGES });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error ?? "Unknown error");
          if (!hasMeaningfulTextPages(textPages)) {
            throw new Error(
              `Unable to render scanned PDF "${file.original_name}". Install poppler-utils/pdftoppm in the API runtime. ${reason}`
            );
          }
          console.warn(`Unable to render PDF "${file.original_name}" for smart split image fallback. Continuing with text only. ${reason}`);
        }

        const groups = await splitPdfIntoDocumentGroups({
          fileName: file.original_name,
          textPages,
          pageImages,
        });

        fileDocuments = await extractPdfDocumentGroups({
          fileName: file.original_name,
          textPages,
          pageImages,
          groups,
        });
      } else if (hasMeaningfulTextPages(textPages)) {
        const documentType = await classifyDocumentFromText(textPages, file.original_name);
        const document = await extractDataFromTextPages({
          fileName: file.original_name,
          textPages,
          documentType,
        });
        fileDocuments = [document];
      } else {
        await params.onProgress?.({
          progress: Math.max(10, Math.round((index / files.length) * 70)),
          stage: `Rendering scanned PDF ${file.original_name}`,
        });

        let pageImages: string[] = [];
        try {
          pageImages = await renderPdfToImagePages(bytes);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error ?? "Unknown error");
          throw new Error(
            `Unable to render scanned PDF "${file.original_name}". Install poppler-utils/pdftoppm in the API runtime. ${reason}`
          );
        }

        if (pageImages.length === 0) {
          const document = fallbackDoc(file.original_name, inferDocTypeFromFilename(file.original_name), {
            pages: Math.max(1, textPages.length),
          });
          fileDocuments = [document];
        } else {
          const documentType = await classifyDocumentFromImage(pageImages[0], file.original_name);
          const document = await extractDataFromImagePages({
            fileName: file.original_name,
            pageImages,
            documentType,
          });
          fileDocuments = [document];
        }
      }
    } else {
      fileDocuments = [fallbackDoc(file.original_name, inferDocTypeFromFilename(file.original_name))];
    }

    for (const document of fileDocuments) {
      document.sourceHint = document.sourceHint ?? file.original_name;
      document.sourceFileName = document.sourceFileName ?? file.original_name;
      documents.push(document);
    }
  }

  await params.onProgress?.({ progress: 80, stage: "Comparing extracted fields" });
  const rawMismatches = verifyCaseDocuments(documents, comparisonOptions);
  const mismatches: Mismatch[] = rawMismatches.map((mismatch) => ({
    ...mismatch,
    ...buildMismatchCopy(mismatch),
  }));

  await params.onProgress?.({ progress: 92, stage: "Finalizing case summary" });
  const summary = summarizeCase(documents, mismatches, fieldConfiguration);

  return {
    documents,
    mismatches,
    summary,
    comparisonOptions,
    analysisMode,
    fieldConfiguration,
  };
}
