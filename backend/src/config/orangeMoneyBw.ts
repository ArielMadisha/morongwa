/** Orange Money pay-to number for Botswana marketplace checkout. */
export const ORANGE_MONEY_BW_NUMBER = String(
  process.env.ORANGE_MONEY_BW_NUMBER || "75 184 537"
).trim();

function formatAmount(currency: string, amount: number): string {
  const cur = String(currency || "BWP").toUpperCase();
  const n = Number(amount || 0);
  if (cur === "BWP") return `P${n.toFixed(2)}`;
  if (cur === "ZAR") return `R${n.toFixed(2)}`;
  return `${cur} ${n.toFixed(2)}`;
}

export function buildOrangeMoneyPaymentMessage(options: {
  orderNumber: string;
  amount: number;
  currency: string;
  reference: string;
}): string {
  const { orderNumber, amount, currency, reference } = options;
  return [
    `Orange Money payment for ${orderNumber}`,
    `Amount: ${formatAmount(currency, amount)}`,
    `Reference: ${reference}`,
    "",
    "Send your payment to this Orange Money number:",
    ORANGE_MONEY_BW_NUMBER,
    "",
    "Use the reference when you pay. We will confirm your order once payment is received.",
  ].join("\n");
}
