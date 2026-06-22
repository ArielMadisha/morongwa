import type { IWorldpayPayeeProfile, WorldpayPhase1Country } from "../data/models/WorldpayPayeeProfile";

/** Default target ISO 4217 for ZAR-funded payouts by destination country */
export function targetCurrencyForCountry(cc: WorldpayPhase1Country): string {
  switch (cc) {
    case "ZA":
      return "ZAR";
    case "BW":
      return "BWP";
    case "ZM":
      return "ZMW";
    default:
      return "ZAR";
  }
}

function cleanBankDetails(b: IWorldpayPayeeProfile["bankDetails"]): Record<string, unknown> {
  const out: Record<string, unknown> = { bankName: b.bankName };
  if (b.branchCode) out.branchCode = b.branchCode;
  if (b.beneficiaryAccountNumber) out.beneficiaryAccountNumber = b.beneficiaryAccountNumber;
  if (b.iban) out.iban = b.iban;
  if (b.swiftBic) out.swiftBic = b.swiftBic;
  if (b.bankCode) out.bankCode = b.bankCode;
  return out;
}

function buildParties(profile: IWorldpayPayeeProfile): Array<Record<string, unknown>> {
  if (profile.payeeKind === "individual") {
    const fn = profile.beneficiaryIndividual?.firstName?.trim();
    const ln = profile.beneficiaryIndividual?.lastName?.trim();
    if (!fn || !ln) throw new Error("Individual payee requires beneficiaryIndividual.firstName and lastName");
    return [
      {
        partyTypeCode: "PT03",
        personalDetails: {
          typeCode: "PD02",
          firstName: fn,
          lastName: ln,
        },
      },
    ];
  }
  const company = profile.beneficiaryCompany?.companyName?.trim();
  if (!company) throw new Error("Business payee requires beneficiaryCompany.companyName");
  return [
    {
      partyTypeCode: "PT03",
      personalDetails: {
        typeCode: "PD01",
        companyName: company,
      },
    },
  ];
}

export interface BuildPayoutOptions {
  /** ZAR amount to send from float (use this OR targetAmount) */
  sourceAmount?: number;
  /** Amount in target currency */
  targetAmount?: number;
  /** Your reference for the payout (6–50 chars recommended) */
  transactionReference?: string;
}

/**
 * Build JSON body for POST /payouts/accounts/single from a stored profile.
 * Funding currency is ZAR; target currency follows destination country.
 */
export function buildSingleAccountPayoutBody(
  profile: IWorldpayPayeeProfile,
  options: BuildPayoutOptions = {}
): Record<string, unknown> {
  const bd = profile.bankDetails;
  if (!bd?.bankName?.trim()) throw new Error("bankDetails.bankName is required");
  const hasIban = Boolean(bd.iban?.trim());
  const hasAcct = Boolean(bd.beneficiaryAccountNumber?.trim());
  if (!hasIban && !hasAcct) throw new Error("Provide either bankDetails.iban or bankDetails.beneficiaryAccountNumber");

  const targetCurrency = targetCurrencyForCountry(profile.countryCode);
  const sourceCurrency = "ZAR";

  const ref =
    options.transactionReference?.trim() ||
    `mw-${String(profile._id).slice(-8)}-${Date.now().toString(36)}`;

  const parties = buildParties(profile);

  const body: Record<string, unknown> = {
    countryCode: profile.countryCode,
    sourceCurrency,
    targetCurrency,
    transactionReference: ref.slice(0, 50),
    transactionTypeCode: profile.transactionTypeCode.trim(),
    bankDetails: cleanBankDetails(bd),
    parties,
  };

  const src = options.sourceAmount;
  const tgt = options.targetAmount;
  if (src != null && tgt != null) throw new Error("Specify only one of sourceAmount or targetAmount");
  if (src != null) {
    if (!(src > 0) || src > 1e9) throw new Error("sourceAmount must be a positive number");
    body.sourceAmount = Math.round(src * 100) / 100;
  } else if (tgt != null) {
    if (!(tgt > 0) || tgt > 1e9) throw new Error("targetAmount must be a positive number");
    body.targetAmount = Math.round(tgt * 100) / 100;
  } else {
    body.sourceAmount = 10.5;
  }

  if (profile.expandableKeyValuePairs && Object.keys(profile.expandableKeyValuePairs).length > 0) {
    body.expandableKeyValuePairs = { ...profile.expandableKeyValuePairs };
  }

  return body;
}
