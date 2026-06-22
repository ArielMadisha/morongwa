export type EftCountry = "ZA" | "BW";

export type EftBankDetails = {
  country: EftCountry;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  accountType?: string;
  branchCode?: string;
  branchName?: string;
  referenceHint: string;
};

/** Capitec Business EFT details for South African marketplace checkout. */
export const EFT_BANK_DETAILS_ZA: EftBankDetails = {
  country: "ZA",
  bankName: String(process.env.EFT_BANK_NAME || "Capitec Business").trim(),
  accountHolder: String(process.env.EFT_ACCOUNT_HOLDER || "Qwertymates(Pty)LTD").trim(),
  accountType: String(process.env.EFT_ACCOUNT_TYPE || "Current").trim(),
  accountNumber: String(process.env.EFT_ACCOUNT_NUMBER || "1055473742").trim(),
  branchCode: String(process.env.EFT_BRANCH_CODE || "450105").trim(),
  referenceHint: "Order reference (shown after checkout)",
};

/** FNB Botswana Business EFT details for Botswana marketplace checkout. */
export const EFT_BANK_DETAILS_BW: EftBankDetails = {
  country: "BW",
  bankName: String(process.env.EFT_BW_BANK_NAME || "FNB Botswana Business").trim(),
  accountHolder: String(process.env.EFT_BW_ACCOUNT_HOLDER || "Qwertymates(Pty)LTD").trim(),
  accountNumber: String(process.env.EFT_BW_ACCOUNT_NUMBER || "62506829342").trim(),
  branchName: String(process.env.EFT_BW_BRANCH_NAME || "Kgale View").trim(),
  referenceHint: "Your email or cellphone number",
};

/** @deprecated Use getEftBankDetails(country) */
export const EFT_BANK_DETAILS = EFT_BANK_DETAILS_ZA;

export function getEftBankDetails(country: string): EftBankDetails {
  return String(country || "").toUpperCase() === "BW" ? EFT_BANK_DETAILS_BW : EFT_BANK_DETAILS_ZA;
}

function formatEftAmount(currency: string, amount: number): string {
  const cur = String(currency || "ZAR").toUpperCase();
  const n = Number(amount || 0);
  if (cur === "BWP") return `P${n.toFixed(2)}`;
  if (cur === "ZAR") return `R${n.toFixed(2)}`;
  return `${cur} ${n.toFixed(2)}`;
}

export function resolveEftPaymentReference(user: {
  email?: string | null;
  phone?: string | null;
}): string {
  const email = String(user.email || "").trim();
  if (email) return email;
  const phone = String(user.phone || "").trim();
  if (phone) return phone;
  return "";
}

export function buildEftPaymentMessage(options: {
  orderNumber: string;
  amount: number;
  currency: string;
  reference: string;
  country: EftCountry;
}): string {
  const { orderNumber, amount, currency, reference, country } = options;
  const d = getEftBankDetails(country);
  const lines = [
    `EFT payment for ${orderNumber}`,
    `Amount: ${formatEftAmount(currency, amount)}`,
    `Reference: ${reference}`,
    "",
    "Bank details:",
    `Bank name: ${d.bankName}`,
    `Account holder: ${d.accountHolder}`,
  ];
  if (d.accountType) lines.push(`Account type: ${d.accountType}`);
  lines.push(`Account number: ${d.accountNumber}`);
  if (d.branchCode) lines.push(`Branch code: ${d.branchCode}`);
  if (d.branchName) lines.push(`Branch: ${d.branchName}`);
  lines.push(
    "",
    country === "BW"
      ? `Use your email or cellphone number as the payment reference when you pay. We will confirm your order once the EFT clears.`
      : "Use the reference exactly when you pay. We will confirm your order once the EFT clears."
  );
  return lines.join("\n");
}
