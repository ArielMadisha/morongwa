import type { TshwaneTownship } from "../data/tshwaneCoverageAreas";

/** Tariff version stored on tasks for audits */
export const ERRAND_PRICING_TSHWANE_VERSION = "tshwane_csv_v2";

export type TransportLoadBand = "light" | "medium" | "heavy" | "extra_heavy";

export type LocalServiceKey = "small_parcel" | "food" | "medium_parcel" | "large_parcel";

export interface PricingComponent {
  label: string;
  customer: number;
  runner: number;
  admin: number;
}

export interface TshwaneQuoteOk {
  ok: true;
  version: typeof ERRAND_PRICING_TSHWANE_VERSION;
  customerTotal: number;
  runnerTotal: number;
  adminTotal: number;
  components: PricingComponent[];
}

export interface TshwaneQuoteErr {
  ok: false;
  code: string;
  message: string;
}

export type TshwaneQuote = TshwaneQuoteOk | TshwaneQuoteErr;

function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function sumComponents(lines: PricingComponent[]): Pick<TshwaneQuoteOk, "customerTotal" | "runnerTotal" | "adminTotal"> {
  let customerTotal = 0;
  let runnerTotal = 0;
  let adminTotal = 0;
  for (const l of lines) {
    customerTotal += l.customer;
    runnerTotal += l.runner;
    adminTotal += l.admin;
  }
  return {
    customerTotal: roundMoney(customerTotal),
    runnerTotal: roundMoney(runnerTotal),
    adminTotal: roundMoney(adminTotal),
  };
}

/**
 * Load bands from transport CSV (10 kg minimum operational floor).
 * Transport (large items) customer / runner / admin from service-type CSV;
 * `runner` = driver commission + helper commission (single pool in quotes).
 */
export function transportBandFromKg(kgRaw: number): TransportLoadBand | null {
  const kg = Number(kgRaw);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  if (kg < 10) return "light";
  if (kg <= 50) return "light";
  if (kg <= 200) return "medium";
  if (kg <= 500) return "heavy";
  if (kg <= 1000) return "extra_heavy";
  return null;
}

const TRANSPORT_BAND_LABEL: Record<TransportLoadBand, string> = {
  light: "Light load (10–50 kg)",
  medium: "Medium load (50–200 kg)",
  heavy: "Heavy load (200–500 kg)",
  extra_heavy: "Extra heavy (500 kg–1 ton)",
};

export function quoteTransportTshwane(input: {
  loadKg: number;
  pickupTownship: TshwaneTownship | undefined;
  deliveryTownship: TshwaneTownship | undefined;
  peak: boolean;
}): TshwaneQuote {
  const band = transportBandFromKg(input.loadKg);
  if (!band) {
    return {
      ok: false,
      code: "TRANSPORT_LOAD_RANGE",
      message:
        "That load is outside our automated band (max 1000 kg).\n\nReply with a weight between 10 and 1000 kg, or open the app for help.",
    };
  }
  if (!input.pickupTownship || !input.deliveryTownship) {
    return { ok: false, code: "TRANSPORT_AREA", message: "Pickup and delivery areas are required." };
  }

  const baseCustomer =
    band === "light" ? 200 : band === "medium" ? 300 : band === "heavy" ? 500 : 700;
  const baseRunner =
    band === "light" ? 140 : band === "medium" ? 210 : band === "heavy" ? 350 : 490;
  const baseAdmin = band === "light" ? 60 : band === "medium" ? 90 : band === "heavy" ? 150 : 210;

  const lines: PricingComponent[] = [
    {
      label: `${TRANSPORT_BAND_LABEL[band]} — ${input.loadKg} kg`,
      customer: baseCustomer,
      runner: baseRunner,
      admin: baseAdmin,
    },
  ];

  const crossTownship = input.pickupTownship.id !== input.deliveryTownship.id;
  if (crossTownship) {
    lines.push({
      label: "Cross-township surcharge",
      customer: 50,
      runner: 35,
      admin: 15,
    });
  }

  if (input.peak) {
    lines.push({
      label: "Peak hours surcharge",
      customer: 30,
      runner: 21,
      admin: 9,
    });
  }

  const totals = sumComponents(lines);
  return {
    ok: true,
    version: ERRAND_PRICING_TSHWANE_VERSION,
    components: lines,
    ...totals,
  };
}

const LOCAL_SERVICE_LABEL: Record<LocalServiceKey, string> = {
  small_parcel: "Small parcel (<2 kg)",
  food: "Food delivery (meals, groceries)",
  medium_parcel: "Medium parcel (2–10 kg)",
  large_parcel: "Large parcel (10–20 kg)",
};

export function quoteLocalErrandTshwane(input: {
  serviceKey: LocalServiceKey;
  pickupTownship: TshwaneTownship | undefined;
  deliveryTownship: TshwaneTownship | undefined;
  peak: boolean;
}): TshwaneQuote {
  if (!input.pickupTownship || !input.deliveryTownship) {
    return { ok: false, code: "LOCAL_AREA", message: "Pickup and delivery areas are required." };
  }

  const sk = input.serviceKey;
  const baseCustomer =
    sk === "small_parcel" ? 25 : sk === "food" ? 30 : sk === "medium_parcel" ? 40 : 60;
  const baseRunner =
    sk === "small_parcel" ? 18 : sk === "food" ? 21 : sk === "medium_parcel" ? 28 : 42;
  const baseAdmin = sk === "small_parcel" ? 7 : sk === "food" ? 9 : sk === "medium_parcel" ? 12 : 18;

  const lines: PricingComponent[] = [
    {
      label: LOCAL_SERVICE_LABEL[sk],
      customer: baseCustomer,
      runner: baseRunner,
      admin: baseAdmin,
    },
  ];

  const crossTownship = input.pickupTownship.id !== input.deliveryTownship.id;
  if (crossTownship) {
    lines.push({
      label: "Cross-township surcharge",
      customer: 15,
      runner: 10,
      admin: 5,
    });
  }

  if (input.peak) {
    lines.push({
      label: "Peak / weekend surcharge",
      customer: 10,
      runner: 7,
      admin: 3,
    });
  }

  const totals = sumComponents(lines);
  return {
    ok: true,
    version: ERRAND_PRICING_TSHWANE_VERSION,
    components: lines,
    ...totals,
  };
}

export function formatTshwaneQuoteWhatsApp(q: TshwaneQuoteOk): string {
  const lines = [
    `💰 Total: R${q.customerTotal}`,
    "",
    "Split:",
    `• Runner (total): R${q.runnerTotal}`,
    `• Platform (total): R${q.adminTotal}`,
    "",
    "Items:",
    ...q.components.map((c) => `• ${c.label}: R${c.customer}`),
  ];
  return lines.join("\n");
}
