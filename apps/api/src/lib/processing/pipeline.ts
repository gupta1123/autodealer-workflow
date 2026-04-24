import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { summarizeCase } from "@/lib/case-summary";
import { DEFAULT_COMPARISON_OPTIONS, readComparisonOptions } from "@/lib/comparison";
import {
  ACTIVE_FIELD_DEFINITIONS,
  FIELD_LABELS,
  getFieldKeysForDocType,
  omitIgnoredFields,
} from "@/lib/document-schema";
import { getPersistedPacketFieldConfiguration } from "@/lib/field-settings-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyCaseDocuments } from "@/services/verification";
import type { CaseDoc, DocType, FieldKey, Mismatch } from "@/types/pipeline";

import { callOpenRouter } from "./openrouter";

const STORAGE_BUCKET = "packet-files";

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
  tollPlaza: ["tollPlaza", "plazaName", "tollLocation"],
  dispatchFrom: ["dispatchFrom", "originAddress", "dispatchAddress"],
  shipTo: ["shipTo", "deliveryAddress", "consigneeAddress"],
  routeFrom: ["routeFrom", "origin", "fromLocation"],
  routeTo: ["routeTo", "destination", "toLocation"],
  mapLocation: ["mapLocation", "address", "registeredAddress", "holderAddress"],
  photoTimestamp: ["photoTimestamp", "captureTimestamp", "evidenceTimestamp"],
  evidenceDescription: ["evidenceDescription", "photoDescription", "observation"],
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

function mapFields(fields: Record<string, unknown>, docType?: DocType): Partial<Record<FieldKey, string>> {
  const result: Partial<Record<FieldKey, string>> = {};
  const allowedFieldKeys = docType ? getAllowedFieldKeysForDocType(docType) : ALL_ALLOWED_FIELD_KEYS;

  allowedFieldKeys.forEach((fieldKey) => {
    const aliases = FIELD_MAPPINGS[fieldKey] ?? [];
    for (const alias of aliases) {
      const value = fields[alias];
      if (value !== undefined && value !== null && value !== "") {
        result[fieldKey] = String(value);
        break;
      }
    }
  });

  return omitIgnoredFields(result) as Partial<Record<FieldKey, string>>;
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

async function extractDataFromImagePages(params: {
  fileName: string;
  pageImages: string[];
  documentType: DocType;
}) {
  const allowedFieldKeys = getAllowedFieldKeysForDocType(params.documentType);
  const allowedFieldKeysText = allowedFieldKeys.join(", ");
  const extracted: Array<{ fields: Record<string, unknown>; visibleText: string }> = [];

  for (const image of params.pageImages) {
    const raw = await callOpenRouter(
      [
        {
          role: "system",
          content:
            `Extract structured fields and visible text from procurement, logistics, transport, vehicle KYC, FASTag, quality certificate, and photo-evidence documents and return only JSON with keys "fields" and "visibleText". ` +
            `This document is a ${params.documentType}. Use only these field keys for this document type: ${allowedFieldKeysText}. ` +
            "visibleText must be a raw OCR-style transcription of the important visible text on the page. " +
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
      { expectJson: true }
    );

    const parsed = safeJsonParse<{ fields?: Record<string, unknown>; visibleText?: unknown; text?: unknown; ocrText?: unknown }>(raw, {});
    extracted.push({
      fields: parsed.fields ?? {},
      visibleText: toText(parsed.visibleText) || toText(parsed.ocrText) || toText(parsed.text),
    });
  }

  const combinedFields = extracted.reduce((acc, current) => ({ ...acc, ...current.fields }), {});
  const fields = mapFields(combinedFields, params.documentType);
  const visibleTextPages = extracted.map((page) => page.visibleText).filter(Boolean);

  const doc: CaseDoc = {
    id: `${params.fileName}-${Date.now()}`,
    type: params.documentType,
    title: `${formatDocType(params.documentType)} — ${params.fileName}`,
    pages: params.pageImages.length,
    fields,
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
}) {
  const allowedFieldKeys = getAllowedFieldKeysForDocType(params.documentType);
  const allowedFieldKeysText = allowedFieldKeys.join(", ");
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
          `Extract structured fields from procurement packet text and return only JSON with keys "fields" and "visibleText". ` +
          `This document is a ${params.documentType}. Use only these field keys for this document type: ${allowedFieldKeysText}. ` +
          "Use only information present in the visible text. For seller-issued documents, vendorName is the issuing supplier and buyerName is the receiving party. " +
          "For Purchase Order or Amended Purchase Order documents, vendorName is the supplier/vendor receiving the order and buyerName is the purchaser issuing the order.",
      },
      {
        role: "user",
        content: `File name: ${params.fileName}\n\nVisible text:\n${visibleText.slice(0, 24000)}`,
      },
    ],
    { expectJson: true }
  );

  const parsed = safeJsonParse<{ fields?: Record<string, unknown>; visibleText?: unknown }>(raw, {});
  const fields = mapFields(parsed.fields ?? {}, params.documentType);
  const doc: CaseDoc = {
    id: `${params.fileName}-${Date.now()}`,
    type: params.documentType,
    title: `${formatDocType(params.documentType)} — ${params.fileName}`,
    pages: Math.max(1, params.textPages.length),
    fields,
    md: "",
    sourceHint: params.fileName,
    sourceFileName: params.fileName,
  };
  doc.md = buildMarkdown(doc, params.textPages);
  return doc;
}

function buildMismatchCopy(mismatch: Omit<Mismatch, "analysis" | "fixPlan">): Pick<Mismatch, "analysis" | "fixPlan"> {
  const label = FIELD_LABELS[mismatch.field as FieldKey] ?? mismatch.field;
  return {
    analysis: `${label} does not reconcile across the uploaded documents. Review the packet before approval.`,
    fixPlan: `1. Confirm the correct ${label.toLowerCase()} from the source document.\n2. Correct or replace the inconsistent file.\n3. Run analysis again before accepting the case.`,
  };
}

export async function processStoredCaseFiles(params: {
  caseId: string;
  comparisonOptions?: unknown;
  onProgress?: (details: { progress: number; stage: string }) => Promise<void> | void;
}) {
  const supabase = createSupabaseAdminClient();
  const fieldConfiguration = await getPersistedPacketFieldConfiguration();
  const comparisonOptions = readComparisonOptions(params.comparisonOptions ?? DEFAULT_COMPARISON_OPTIONS);

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

    let document: CaseDoc;
    if (mimeType.startsWith("image/")) {
      await params.onProgress?.({
        progress: Math.max(10, Math.round((index / files.length) * 70)),
        stage: `Extracting ${file.original_name}`,
      });
      const image = bufferToDataUrl(bytes, mimeType);
      const documentType = await classifyDocumentFromImage(image, file.original_name);
      document = await extractDataFromImagePages({
        fileName: file.original_name,
        pageImages: [image],
        documentType,
      });
    } else if (mimeType === "application/pdf") {
      const textPages = await extractPdfTextPages(bytes);
      const documentType = await classifyDocumentFromText(textPages, file.original_name);
      document = await extractDataFromTextPages({
        fileName: file.original_name,
        textPages,
        documentType,
      });
    } else {
      document = fallbackDoc(file.original_name, inferDocTypeFromFilename(file.original_name));
    }

    document.sourceHint = file.original_name;
    document.sourceFileName = file.original_name;
    documents.push(document);
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
    fieldConfiguration,
  };
}
