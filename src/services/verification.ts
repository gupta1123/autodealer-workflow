import type { CaseDoc, FieldKey, Mismatch, MismatchValue } from "@/types/pipeline";

type ComparableValue = {
  docId: string;
  value: string | number | null | undefined;
};

const normalize = (value: string | number | null | undefined) => {
  if (value == null) return null;
  return value.toString().toLowerCase().replace(/[^a-z0-9.-]/g, "");
};

function buildMismatch(field: string, values: ComparableValue[]): Omit<Mismatch, "analysis" | "fixPlan"> | null {
  const populated = values.filter((entry) => entry.value !== undefined && entry.value !== null && String(entry.value).trim() !== "");
  if (populated.length < 2) return null;
  const unique = new Set(populated.map((entry) => normalize(entry.value)).filter(Boolean));
  if (unique.size <= 1) return null;

  return {
    id: `mismatch-${field}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    field,
    values: populated as MismatchValue[],
  };
}

function pickFieldValues(docs: CaseDoc[], field: FieldKey) {
  return docs.map((doc) => ({
    docId: doc.id,
    value: doc.fields[field],
  }));
}

export function verifyCaseDocuments(docs: CaseDoc[]): Omit<Mismatch, "analysis" | "fixPlan">[] {
  const mismatches: Omit<Mismatch, "analysis" | "fixPlan">[] = [];

  const directFields: FieldKey[] = [
    "vendorName",
    "supplierGstin",
    "buyerName",
    "buyerGstin",
    "currency",
    "itemDescription",
    "itemQuantity",
    "materialDescription",
    "materialGrade",
    "hsnSac",
    "eWayBillNumber",
    "weighmentNumber",
    "lorryReceiptNumber",
    "transactionDate",
    "statementAmount",
    "vehicleNumber",
    "registrationNumber",
    "ownerName",
    "driverName",
    "panNumber",
    "licenseNumber",
    "chassisNumber",
    "engineNumber",
    "grossWeight",
    "tareWeight",
    "netWeight",
    "transporterName",
    "bankName",
    "accountNumber",
    "transactionReference",
    "dispatchFrom",
    "shipTo",
    "routeFrom",
    "routeTo",
    "mapLocation",
  ];

  for (const field of directFields) {
    const mismatch = buildMismatch(field, pickFieldValues(docs, field));
    if (mismatch) mismatches.push(mismatch);
  }

  const poReferenceMismatch = buildMismatch(
    "poNumber",
    docs.map((doc) => ({
      docId: doc.id,
      value: doc.fields.poNumber ?? doc.fields.referencePoNumber,
    }))
  );
  if (poReferenceMismatch) mismatches.push(poReferenceMismatch);

  const invoiceReferenceMismatch = buildMismatch(
    "invoiceNumber",
    docs.map((doc) => ({
      docId: doc.id,
      value: doc.fields.invoiceNumber ?? doc.fields.referenceInvoiceNumber,
    }))
  );
  if (invoiceReferenceMismatch) mismatches.push(invoiceReferenceMismatch);

  const amountMismatch = buildMismatch(
    "totalAmount",
    docs.map((doc) => ({
      docId: doc.id,
      value: doc.fields.totalAmount ?? doc.fields.paidAmount,
    }))
  );
  if (amountMismatch) mismatches.push(amountMismatch);

  return mismatches;
}
