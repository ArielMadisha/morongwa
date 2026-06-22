/**
 * Reference payouts for successful agent onboarding / registration (per country calling prefix).
 * Amount is informational for admin review; actual payout rails may differ.
 */

export type AgentRegistrationIncentive = {
  iso: string;
  currencyCode: string;
  amount: number;
  symbol: string;
  display: string;
};

const PREFIXES: Array<{ prefix: string; incentive: AgentRegistrationIncentive }> = [
  {
    prefix: "267",
    incentive: {
      iso: "BW",
      currencyCode: "BWP",
      amount: 30,
      symbol: "P",
      display: "P30 (Botswana)",
    },
  },
  {
    prefix: "264",
    incentive: {
      iso: "NA",
      currencyCode: "NAD",
      amount: 30,
      symbol: "N$",
      display: "N$30 (Namibia)",
    },
  },
  {
    prefix: "260",
    incentive: {
      iso: "ZM",
      currencyCode: "ZMW",
      amount: 30,
      symbol: "K",
      display: "K30 / 30 kwacha (Zambia)",
    },
  },
  {
    prefix: "266",
    incentive: {
      iso: "LS",
      currencyCode: "LSL",
      amount: 30,
      symbol: "L",
      display: "L30 / 30 maloti (Lesotho)",
    },
  },
  {
    prefix: "263",
    incentive: {
      iso: "ZW",
      currencyCode: "ZWL",
      amount: 30,
      symbol: "Z$",
      display: "Z$30 (Zimbabwe)",
    },
  },
  {
    prefix: "268",
    incentive: {
      iso: "SZ",
      currencyCode: "SZL",
      amount: 30,
      symbol: "E",
      display: "E30 (Eswatini)",
    },
  },
  {
    prefix: "258",
    incentive: {
      iso: "MZ",
      currencyCode: "MZN",
      amount: 30,
      symbol: "MT",
      display: "MT30 (Mozambique)",
    },
  },
  {
    prefix: "27",
    incentive: {
      iso: "ZA",
      currencyCode: "ZAR",
      amount: 30,
      symbol: "R",
      display: "R30 (South Africa)",
    },
  },
];

export function getAgentRegistrationIncentiveForWaDigits(digits: string): AgentRegistrationIncentive {
  const d = String(digits || "").replace(/\D/g, "");
  for (const row of PREFIXES) {
    if (d.startsWith(row.prefix)) return row.incentive;
  }
  return {
    iso: "DEF",
    currencyCode: "ZAR",
    amount: 30,
    symbol: "R",
    display: "30 units (default — verify country / payout rail)",
  };
}

export function listAgentRegistrationIncentiveReference(): AgentRegistrationIncentive[] {
  return PREFIXES.map((p) => p.incentive);
}
