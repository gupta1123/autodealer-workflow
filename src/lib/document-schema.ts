import type { DocType, FieldKey } from "@/types/pipeline";

export type FieldDefinition = {
  key: FieldKey;
  label: string;
  important?: boolean;
};

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: "poNumber", label: "PO Number", important: true },
  { key: "poAmendmentNumber", label: "PO Amendment Number" },
  { key: "invoiceNumber", label: "Invoice Number", important: true },
  { key: "receiptNumber", label: "Receipt Number" },
  { key: "deliveryNoteNumber", label: "Delivery Note Number" },
  { key: "referencePoNumber", label: "Reference PO Number" },
  { key: "referenceInvoiceNumber", label: "Reference Invoice Number" },
  { key: "eWayBillNumber", label: "E-Way Bill Number", important: true },
  { key: "weighmentNumber", label: "Weighment Number", important: true },
  { key: "weighbridgeName", label: "Weighbridge Name" },
  { key: "lorryReceiptNumber", label: "Lorry Receipt Number", important: true },
  { key: "certificateNumber", label: "Certificate Number" },
  { key: "certificateDate", label: "Certificate Date" },
  { key: "permitNumber", label: "Permit Number" },
  { key: "permitType", label: "Permit Type" },
  { key: "licenseNumber", label: "Driving Licence Number" },
  { key: "registrationNumber", label: "Registration Number" },
  { key: "chassisNumber", label: "Chassis Number" },
  { key: "engineNumber", label: "Engine Number" },
  { key: "vehicleClass", label: "Vehicle Class" },
  { key: "vehicleNumber", label: "Vehicle Number", important: true },
  { key: "fuelType", label: "Fuel Type" },
  { key: "vendorName", label: "Vendor Name", important: true },
  { key: "supplierGstin", label: "Supplier GSTIN" },
  { key: "buyerName", label: "Buyer Name" },
  { key: "buyerGstin", label: "Buyer GSTIN" },
  { key: "transporterName", label: "Transporter Name" },
  { key: "ownerName", label: "Owner Name" },
  { key: "driverName", label: "Driver Name" },
  { key: "holderName", label: "Document Holder Name" },
  { key: "fatherName", label: "Father Name" },
  { key: "panNumber", label: "PAN Number" },
  { key: "documentDate", label: "Document Date" },
  { key: "ackDate", label: "Acknowledgement Date" },
  { key: "transactionDate", label: "Transaction Date" },
  { key: "validityDate", label: "Validity Date" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "currency", label: "Currency" },
  { key: "subtotal", label: "Subtotal" },
  { key: "taxAmount", label: "Tax Amount" },
  { key: "totalAmount", label: "Total Amount", important: true },
  { key: "paidAmount", label: "Paid Amount" },
  { key: "statementAmount", label: "Statement Amount" },
  { key: "freightAmount", label: "Freight Amount" },
  { key: "advanceAmount", label: "Advance Amount" },
  { key: "toPayAmount", label: "To-Pay Amount" },
  { key: "itemDescription", label: "Item Description" },
  { key: "materialDescription", label: "Material Description" },
  { key: "materialGrade", label: "Material Grade" },
  { key: "itemQuantity", label: "Item Quantity", important: true },
  { key: "unit", label: "Unit" },
  { key: "hsnSac", label: "HSN / SAC" },
  { key: "batchNumber", label: "Batch Number" },
  { key: "heatNumber", label: "Heat Number" },
  { key: "grossWeight", label: "Gross Weight" },
  { key: "tareWeight", label: "Tare Weight" },
  { key: "netWeight", label: "Net Weight", important: true },
  { key: "bankName", label: "Bank Name" },
  { key: "accountNumber", label: "Account Number" },
  { key: "irnNumber", label: "IRN Number" },
  { key: "ackNumber", label: "Acknowledgement Number" },
  { key: "transactionReference", label: "Transaction Reference" },
  { key: "fastagReference", label: "FASTag Reference" },
  { key: "tollPlaza", label: "Toll Plaza" },
  { key: "dispatchFrom", label: "Dispatch From" },
  { key: "shipTo", label: "Ship To" },
  { key: "routeFrom", label: "Route From" },
  { key: "routeTo", label: "Route To" },
  { key: "mapLocation", label: "Address / Location" },
  { key: "photoTimestamp", label: "Photo Timestamp" },
  { key: "evidenceDescription", label: "Evidence Description" },
];

export const IGNORED_PACKET_FIELD_KEYS: readonly FieldKey[] = [
  "certificateDate",
  "documentDate",
  "ackDate",
  "transactionDate",
  "validityDate",
  "dateOfBirth",
  "itemDescription",
  "photoTimestamp",
];

const IGNORED_PACKET_FIELD_KEY_SET = new Set<FieldKey>(IGNORED_PACKET_FIELD_KEYS);

export function shouldConsiderFieldKey(fieldKey: string): fieldKey is FieldKey {
  return !IGNORED_PACKET_FIELD_KEY_SET.has(fieldKey as FieldKey);
}

export const ACTIVE_FIELD_DEFINITIONS = FIELD_DEFINITIONS.filter(({ key }) =>
  shouldConsiderFieldKey(key)
);

export function omitIgnoredFields<T>(fields: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => shouldConsiderFieldKey(key))
  ) as Record<string, T>;
}

const FIELD_DEFINITION_LOOKUP = FIELD_DEFINITIONS.reduce(
  (acc, field) => {
    acc[field.key] = field;
    return acc;
  },
  {} as Record<FieldKey, FieldDefinition>
);

export const FIELD_LABELS: Record<FieldKey, string> = FIELD_DEFINITIONS.reduce(
  (acc, field) => {
    acc[field.key] = field.label;
    return acc;
  },
  {} as Record<FieldKey, string>
);

export const CORE_PACKET_GROUPS: Array<{ label: string; types: DocType[] }> = [
  {
    label: "Purchase Order",
    types: ["Purchase Order", "Amended Purchase Order"],
  },
  {
    label: "Invoice",
    types: ["Invoice", "Tax Invoice"],
  },
  {
    label: "E-Way Bill",
    types: ["E-Way Bill"],
  },
  {
    label: "Transport Document",
    types: ["Lorry Receipt", "Delivery Challan", "Transport Permit"],
  },
  {
    label: "Weight Proof",
    types: ["Weighment Slip"],
  },
];

export const DOC_TYPE_EXTRACTION_FIELDS: Record<DocType, FieldKey[]> = {
  "Purchase Order": [
    "vendorName",
    "supplierGstin",
    "buyerName",
    "buyerGstin",
    "poNumber",
    "documentDate",
    "currency",
    "itemDescription",
    "materialDescription",
    "materialGrade",
    "itemQuantity",
    "unit",
    "hsnSac",
    "subtotal",
    "taxAmount",
    "totalAmount",
    "shipTo",
  ],
  "Amended Purchase Order": [
    "vendorName",
    "supplierGstin",
    "buyerName",
    "buyerGstin",
    "poNumber",
    "poAmendmentNumber",
    "documentDate",
    "currency",
    "itemDescription",
    "materialDescription",
    "materialGrade",
    "itemQuantity",
    "unit",
    "hsnSac",
    "subtotal",
    "taxAmount",
    "totalAmount",
    "shipTo",
  ],
  Invoice: [
    "vendorName",
    "supplierGstin",
    "buyerName",
    "buyerGstin",
    "invoiceNumber",
    "referencePoNumber",
    "documentDate",
    "currency",
    "itemDescription",
    "materialDescription",
    "itemQuantity",
    "unit",
    "hsnSac",
    "subtotal",
    "taxAmount",
    "totalAmount",
    "vehicleNumber",
    "dispatchFrom",
    "shipTo",
  ],
  "Tax Invoice": [
    "vendorName",
    "supplierGstin",
    "buyerName",
    "buyerGstin",
    "invoiceNumber",
    "referencePoNumber",
    "irnNumber",
    "ackNumber",
    "ackDate",
    "documentDate",
    "currency",
    "itemDescription",
    "materialDescription",
    "itemQuantity",
    "unit",
    "hsnSac",
    "subtotal",
    "taxAmount",
    "totalAmount",
    "vehicleNumber",
    "dispatchFrom",
    "shipTo",
    "bankName",
    "accountNumber",
  ],
  Receipt: ["receiptNumber", "referenceInvoiceNumber", "documentDate", "paidAmount", "currency"],
  "Delivery Note": [
    "deliveryNoteNumber",
    "referencePoNumber",
    "documentDate",
    "vendorName",
    "buyerName",
    "itemDescription",
    "itemQuantity",
    "vehicleNumber",
  ],
  "Delivery Challan": [
    "deliveryNoteNumber",
    "referencePoNumber",
    "documentDate",
    "vendorName",
    "buyerName",
    "itemDescription",
    "itemQuantity",
    "vehicleNumber",
    "routeFrom",
    "routeTo",
  ],
  "E-Way Bill": [
    "eWayBillNumber",
    "invoiceNumber",
    "documentDate",
    "vendorName",
    "supplierGstin",
    "buyerName",
    "buyerGstin",
    "vehicleNumber",
    "dispatchFrom",
    "shipTo",
    "routeFrom",
    "routeTo",
    "transactionDate",
    "taxAmount",
    "totalAmount",
  ],
  "Weighment Slip": [
    "weighmentNumber",
    "weighbridgeName",
    "documentDate",
    "vehicleNumber",
    "vendorName",
    "buyerName",
    "materialDescription",
    "grossWeight",
    "tareWeight",
    "netWeight",
  ],
  "Lorry Receipt": [
    "lorryReceiptNumber",
    "documentDate",
    "transporterName",
    "vendorName",
    "buyerName",
    "routeFrom",
    "routeTo",
    "vehicleNumber",
    "materialDescription",
    "netWeight",
    "freightAmount",
    "advanceAmount",
    "toPayAmount",
  ],
  "Vehicle Registration Certificate": [
    "registrationNumber",
    "ownerName",
    "vehicleNumber",
    "chassisNumber",
    "engineNumber",
    "vehicleClass",
    "fuelType",
    "documentDate",
    "validityDate",
    "mapLocation",
  ],
  "Driving Licence": [
    "licenseNumber",
    "driverName",
    "dateOfBirth",
    "documentDate",
    "validityDate",
    "mapLocation",
  ],
  "PAN Card": ["panNumber", "holderName", "fatherName", "dateOfBirth"],
  "FASTag Toll Proof": [
    "transactionDate",
    "vehicleNumber",
    "fastagReference",
    "tollPlaza",
    "paidAmount",
    "statementAmount",
  ],
  "Material Test Certificate": [
    "certificateNumber",
    "certificateDate",
    "vendorName",
    "buyerName",
    "materialDescription",
    "materialGrade",
    "batchNumber",
    "heatNumber",
    "itemQuantity",
    "grossWeight",
    "netWeight",
  ],
  "Photo Evidence": ["photoTimestamp", "vehicleNumber", "evidenceDescription"],
  "Transport Permit": [
    "permitNumber",
    "permitType",
    "documentDate",
    "validityDate",
    "vehicleNumber",
    "ownerName",
  ],
  "Bank Statement": ["bankName", "accountNumber", "transactionDate", "transactionReference", "statementAmount"],
  "Map Printout": ["routeFrom", "routeTo", "mapLocation"],
  "Payment Screenshot": ["transactionDate", "transactionReference", "paidAmount", "statementAmount"],
  Unknown: [],
};

export function getFieldKeysForDocType(docType: DocType | string): FieldKey[] {
  return (DOC_TYPE_EXTRACTION_FIELDS[docType as DocType] ?? []).filter(shouldConsiderFieldKey);
}

export function getFieldDefinitionsByKeys(fieldKeys: readonly string[]): FieldDefinition[] {
  const seen = new Set<FieldKey>();

  return fieldKeys.flatMap((fieldKey) => {
    const normalizedKey = fieldKey as FieldKey;
    const fieldDefinition = FIELD_DEFINITION_LOOKUP[normalizedKey];

    if (!fieldDefinition || seen.has(normalizedKey) || !shouldConsiderFieldKey(normalizedKey)) {
      return [];
    }

    seen.add(normalizedKey);
    return [fieldDefinition];
  });
}

export function getFieldDefinitionsForDocType(docType: DocType | string): FieldDefinition[] {
  return getFieldDefinitionsByKeys(getFieldKeysForDocType(docType));
}
