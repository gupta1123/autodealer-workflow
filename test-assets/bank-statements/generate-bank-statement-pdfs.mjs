import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = dirname(fileURLToPath(import.meta.url));

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildPdf(lines) {
  const contentLines = [
    "BT",
    "/F1 10 Tf",
    "42 790 Td",
    "13 TL",
    ...lines.flatMap((line, index) =>
      index === 0
        ? [`(${escapePdfText(line)}) Tj`]
        : ["T*", `(${escapePdfText(line)}) Tj`]
    ),
    "ET",
  ];
  const stream = contentLines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

const samples = [
  {
    file: "kalika-hdfc-june-ai-sample.pdf",
    lines: [
      "HDFC BANK STATEMENT",
      "Bank Name: HDFC Bank",
      "Account Holder Name: Kalika Steel Alloys Pvt Ltd",
      "Account Number: 50100234567890",
      "IFSC Code: HDFC0001234",
      "Statement Period: 01/06/2026 to 03/06/2026",
      "",
      "Transaction 1",
      "Date: 01/06/2026 | Value Date: 01/06/2026 | Reference: 12345",
      "Description: NEFT RECEIPT FROM BHARAT STEELS UTR 12345",
      "Debit: | Credit: 50000.00 | Balance: 50000.00",
      "Transaction 2",
      "Date: 02/06/2026 | Value Date: 02/06/2026 | Reference: 9988",
      "Description: UPI PAYMENT TO OFFICE SUPPLIES REF 9988",
      "Debit: 2500.00 | Credit: | Balance: 47500.00",
      "Transaction 3",
      "Date: 03/06/2026 | Value Date: 03/06/2026 | Reference: HDFC-CHG-01",
      "Description: BANK CHARGES GST",
      "Debit: 118.00 | Credit: | Balance: 47382.00",
      "",
      "Closing Balance: INR 47,382.00",
    ],
  },
  {
    file: "kalika-sbi-june-ai-sample.pdf",
    lines: [
      "STATE BANK OF INDIA ACCOUNT STATEMENT",
      "Bank Name: State Bank of India",
      "Customer Name: Kalika Steel Alloys Pvt Ltd",
      "A/C No: 409876543210",
      "IFSC: SBIN0000456",
      "Statement Period: 01/06/2026 to 05/06/2026",
      "",
      "Transaction 1",
      "Txn Date: 01/06/2026 | Value Date: 01/06/2026 | Ref No: SBI-RTGS-01",
      "Narration: RTGS PAYMENT TO TRANSPORT VENDOR",
      "Withdrawal: 45000.00 | Deposit: | Balance: 64382.00",
      "Transaction 2",
      "Txn Date: 02/06/2026 | Value Date: 02/06/2026 | Ref No: SBI-NEFT-02",
      "Narration: NEFT RECEIPT FROM ACME RETAIL PRIVATE LIMITED",
      "Withdrawal: | Deposit: 73500.00 | Balance: 137882.00",
      "Transaction 3",
      "Txn Date: 03/06/2026 | Value Date: 03/06/2026 | Ref No: SBI-CASH-03",
      "Narration: CASH DEPOSIT BRANCH SATARA",
      "Withdrawal: | Deposit: 25000.00 | Balance: 162882.00",
      "Transaction 4",
      "Txn Date: 04/06/2026 | Value Date: 04/06/2026 | Ref No: CHQ-889001",
      "Narration: CHEQUE PAYMENT TO QUALIMECH ENGINEERS",
      "Withdrawal: 32000.00 | Deposit: | Balance: 130882.00",
      "Transaction 5",
      "Txn Date: 05/06/2026 | Value Date: 05/06/2026 | Ref No: SBI-CHG-05",
      "Narration: SMS ALERT CHARGES GST",
      "Withdrawal: 29.50 | Deposit: | Balance: 130852.50",
      "",
      "Closing Balance: INR 1,30,852.50",
    ],
  },
];

mkdirSync(outDir, { recursive: true });
for (const sample of samples) {
  writeFileSync(join(outDir, sample.file), buildPdf(sample.lines));
}
