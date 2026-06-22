import Wallet from "../data/models/Wallet";
import MerchantVasTx from "../data/models/MerchantVasTx";
import { AppError } from "../middleware/errorHandler";

export type VasKind = "airtime" | "data" | "electricity";

function commissionRate(kind: VasKind): number {
  if (kind === "data") return 0.04;
  if (kind === "electricity") return 0.02;
  return 0.03;
}

export async function executeVasPurchase(input: {
  userId: string;
  kind: VasKind;
  amount: number;
  recipientPhone?: string;
  meterNumber?: string;
  source: "web" | "mobile" | "whatsapp" | "api";
}) {
  const wallet = (await Wallet.findOne({ user: input.userId })) || (await Wallet.create({ user: input.userId }));
  if (wallet.balance < input.amount) {
    throw new AppError("Insufficient wallet balance", 400);
  }
  const reference = `VAS-${input.kind.toUpperCase()}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const rate = commissionRate(input.kind);
  const commissionTotal = Math.round(input.amount * rate * 100) / 100;
  const merchantCommission = Math.round(commissionTotal * 0.7 * 100) / 100;
  const platformCommission = Math.round((commissionTotal - merchantCommission) * 100) / 100;

  wallet.balance = Math.round((wallet.balance - input.amount) * 100) / 100;
  wallet.transactions.push({
    type: "debit",
    amount: -input.amount,
    reference,
    createdAt: new Date(),
  });
  await wallet.save();

  const provider = String(process.env.VAS_PROVIDER || "simulated").trim() || "simulated";
  const providerReference = `${provider.toUpperCase()}-${Date.now()}`;
  const tx = await MerchantVasTx.create({
    user: input.userId,
    kind: input.kind,
    status: "completed",
    amount: input.amount,
    currency: "ZAR",
    recipientPhone: input.recipientPhone,
    meterNumber: input.meterNumber,
    provider,
    providerReference,
    reference,
    commissionTotal,
    merchantCommission,
    platformCommission,
    source: input.source,
  });

  return { tx, balance: wallet.balance };
}
