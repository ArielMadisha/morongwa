import CourierProvider from "../data/models/CourierProvider";
import CourierTariff from "../data/models/CourierTariff";

type SeedTariff = {
  countryCode: string;
  zone?: string;
  serviceLabel: string;
  minWeightKg: number;
  maxWeightKg: number;
  price: number;
  currency: string;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  sortOrder: number;
};

const CATALOG_SEED_TTL_MS = 15 * 60 * 1000;
let catalogSeededAt = 0;
let catalogSeedInFlight: Promise<void> | null = null;

/** Default courier catalog (editable in Admin → Couriers). Synced at startup and at most every 15 min. */
export async function ensureCourierCatalogSeed(force = false): Promise<void> {
  const now = Date.now();
  if (!force && catalogSeededAt > 0 && now - catalogSeededAt < CATALOG_SEED_TTL_MS) {
    return;
  }
  if (!force && catalogSeedInFlight) {
    return catalogSeedInFlight;
  }

  catalogSeedInFlight = runCourierCatalogSeed()
    .then(() => {
      catalogSeededAt = Date.now();
    })
    .finally(() => {
      catalogSeedInFlight = null;
    });

  return catalogSeedInFlight;
}

async function runCourierCatalogSeed(): Promise<void> {
  const providers: Array<{
    slug: string;
    name: string;
    coverage: "domestic_za" | "cross_border_sadc" | "domestic_bw";
    countries: string[];
    integrationType: "api" | "portal" | "tariff_table" | "quote_based";
    pricingNote?: string;
    sortOrder: number;
    tariffs: SeedTariff[];
  }> = [
    {
      slug: "paxi",
      name: "PAXI",
      coverage: "domestic_za",
      countries: ["ZA"],
      integrationType: "portal",
      pricingNote:
        "All PAXI parcel types: max 45 cm width × 37 cm height × 5 kg. Point-to-point Standard/Large rates differ by service level; bag tier auto-selected at checkout when you choose Economy or Speed. PEP / Shoe City / Tekkie Town network.",
      sortOrder: 10,
      tariffs: [
        {
          countryCode: "ZA",
          zone: "Standard (45 cm max width · 37 cm max height · 5 kg max weight)",
          serviceLabel: "Standard — Economy (7–9 business days)",
          minWeightKg: 0,
          maxWeightKg: 5,
          price: 59.95,
          currency: "ZAR",
          minDeliveryDays: 7,
          maxDeliveryDays: 9,
          sortOrder: 10,
        },
        {
          countryCode: "ZA",
          zone: "Standard (45 cm max width · 37 cm max height · 5 kg max weight)",
          serviceLabel: "Standard — Speed (7–9 business days)",
          minWeightKg: 0,
          maxWeightKg: 5,
          price: 109.95,
          currency: "ZAR",
          minDeliveryDays: 7,
          maxDeliveryDays: 9,
          sortOrder: 11,
        },
        {
          countryCode: "ZA",
          zone: "Large (45 cm max width · 37 cm max height · 5 kg max weight)",
          serviceLabel: "Large — Economy (7–9 business days)",
          minWeightKg: 0,
          maxWeightKg: 5,
          price: 119.95,
          currency: "ZAR",
          minDeliveryDays: 7,
          maxDeliveryDays: 9,
          sortOrder: 20,
        },
        {
          countryCode: "ZA",
          zone: "Large (45 cm max width · 37 cm max height · 5 kg max weight)",
          serviceLabel: "Large — Speed (7–9 business days)",
          minWeightKg: 0,
          maxWeightKg: 5,
          price: 139.95,
          currency: "ZAR",
          minDeliveryDays: 7,
          maxDeliveryDays: 9,
          sortOrder: 21,
        },
        {
          countryCode: "ZA",
          zone: "Store to Home (45 cm max width · 37 cm max height · 5 kg max weight)",
          serviceLabel: "Store to Home — Standard (3–5 business days)",
          minWeightKg: 0,
          maxWeightKg: 5,
          price: 119.95,
          currency: "ZAR",
          minDeliveryDays: 3,
          maxDeliveryDays: 5,
          sortOrder: 30,
        },
        {
          countryCode: "ZA",
          zone: "Store to Home (45 cm max width · 37 cm max height · 5 kg max weight)",
          serviceLabel: "Store to Home — Large (3–5 business days)",
          minWeightKg: 0,
          maxWeightKg: 5,
          price: 149.95,
          currency: "ZAR",
          minDeliveryDays: 3,
          maxDeliveryDays: 5,
          sortOrder: 31,
        },
      ],
    },
    {
      slug: "courier-guy",
      name: "The Courier Guy",
      coverage: "domestic_za",
      countries: ["ZA"],
      integrationType: "tariff_table",
      pricingNote: "Local standard door-to-door deliveries from R100 (weight-based quotes on courier site).",
      sortOrder: 20,
      tariffs: [
        {
          countryCode: "ZA",
          serviceLabel: "Standard door-to-door (from R100)",
          minWeightKg: 0,
          maxWeightKg: 30,
          price: 100,
          currency: "ZAR",
          minDeliveryDays: 2,
          maxDeliveryDays: 5,
          sortOrder: 10,
        },
      ],
    },
    {
      slug: "pudo",
      name: "Pudo",
      coverage: "domestic_za",
      countries: ["ZA"],
      integrationType: "tariff_table",
      pricingNote: "Locker-to-locker by The Courier Guy — from R60 for up to 5 kg.",
      sortOrder: 30,
      tariffs: [
        {
          countryCode: "ZA",
          serviceLabel: "Locker-to-locker (up to 5 kg)",
          minWeightKg: 0,
          maxWeightKg: 5,
          price: 60,
          currency: "ZAR",
          minDeliveryDays: 2,
          maxDeliveryDays: 4,
          sortOrder: 10,
        },
      ],
    },
    {
      slug: "icexpress",
      name: "ICExpress",
      coverage: "cross_border_sadc",
      countries: ["BW", "NA", "LS", "ZW", "ZM", "MZ"],
      integrationType: "quote_based",
      pricingNote: "Road freight, weekly departures. Door-to-door, customs clearance, tracking.",
      sortOrder: 40,
      tariffs: [
        { countryCode: "BW", serviceLabel: "Road freight (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 420, currency: "ZAR", minDeliveryDays: 5, maxDeliveryDays: 10, sortOrder: 10 },
        { countryCode: "NA", serviceLabel: "Road freight (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 450, currency: "ZAR", minDeliveryDays: 5, maxDeliveryDays: 10, sortOrder: 10 },
        { countryCode: "LS", serviceLabel: "Road freight (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 380, currency: "ZAR", minDeliveryDays: 5, maxDeliveryDays: 9, sortOrder: 10 },
        { countryCode: "ZW", serviceLabel: "Road freight (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 480, currency: "ZAR", minDeliveryDays: 6, maxDeliveryDays: 10, sortOrder: 10 },
        { countryCode: "ZM", serviceLabel: "Road freight (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 500, currency: "ZAR", minDeliveryDays: 6, maxDeliveryDays: 10, sortOrder: 10 },
        { countryCode: "MZ", serviceLabel: "Road freight (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 520, currency: "ZAR", minDeliveryDays: 7, maxDeliveryDays: 12, sortOrder: 10 },
      ],
    },
    {
      slug: "bex-express",
      name: "BEX Express",
      coverage: "cross_border_sadc",
      countries: ["BW", "NA", "LS", "SZ"],
      integrationType: "quote_based",
      pricingNote: "Budget and express road freight. Transit 24–72 hours depending on destination.",
      sortOrder: 50,
      tariffs: [
        { countryCode: "BW", serviceLabel: "Express road (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 360, currency: "ZAR", minDeliveryDays: 1, maxDeliveryDays: 3, sortOrder: 10 },
        { countryCode: "NA", serviceLabel: "Express road (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 390, currency: "ZAR", minDeliveryDays: 2, maxDeliveryDays: 3, sortOrder: 10 },
        { countryCode: "LS", serviceLabel: "Express road (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 340, currency: "ZAR", minDeliveryDays: 1, maxDeliveryDays: 3, sortOrder: 10 },
        { countryCode: "SZ", serviceLabel: "Express road (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 350, currency: "ZAR", minDeliveryDays: 2, maxDeliveryDays: 3, sortOrder: 10 },
      ],
    },
    {
      slug: "triton-express",
      name: "Triton Express",
      coverage: "cross_border_sadc",
      countries: ["BW", "NA", "ZW", "MZ", "LS"],
      integrationType: "quote_based",
      pricingNote: "Cross-border freight. Regional 24–72h; longer routes 7–10 days.",
      sortOrder: 60,
      tariffs: [
        { countryCode: "BW", serviceLabel: "Regional (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 380, currency: "ZAR", minDeliveryDays: 1, maxDeliveryDays: 3, sortOrder: 10 },
        { countryCode: "NA", serviceLabel: "Regional (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 400, currency: "ZAR", minDeliveryDays: 2, maxDeliveryDays: 4, sortOrder: 10 },
        { countryCode: "ZW", serviceLabel: "Regional (0–10 kg)", minWeightKg: 0, maxWeightKg: 10, price: 450, currency: "ZAR", minDeliveryDays: 3, maxDeliveryDays: 7, sortOrder: 10 },
        { countryCode: "MZ", serviceLabel: "Regional (0–10 kg)", minWeightKg: 0, maxWeightKg: 10, price: 470, currency: "ZAR", minDeliveryDays: 4, maxDeliveryDays: 8, sortOrder: 10 },
        { countryCode: "LS", serviceLabel: "Regional (0–5 kg)", minWeightKg: 0, maxWeightKg: 5, price: 360, currency: "ZAR", minDeliveryDays: 1, maxDeliveryDays: 3, sortOrder: 10 },
      ],
    },
    {
      slug: "botswanapost",
      name: "BotswanaPost",
      coverage: "domestic_bw",
      countries: ["BW"],
      integrationType: "tariff_table",
      pricingNote: "Official domestic tariff calculator by weight and destination.",
      sortOrder: 70,
      tariffs: [
        { countryCode: "BW", zone: "National", serviceLabel: "0–1 kg", minWeightKg: 0, maxWeightKg: 1, price: 35, currency: "BWP", minDeliveryDays: 3, maxDeliveryDays: 7, sortOrder: 10 },
        { countryCode: "BW", zone: "National", serviceLabel: "5–10 kg", minWeightKg: 5, maxWeightKg: 10, price: 165, currency: "BWP", minDeliveryDays: 3, maxDeliveryDays: 7, sortOrder: 20 },
        { countryCode: "BW", zone: "National", serviceLabel: "20–50 kg", minWeightKg: 20, maxWeightKg: 50, price: 365, currency: "BWP", minDeliveryDays: 4, maxDeliveryDays: 8, sortOrder: 30 },
      ],
    },
    {
      slug: "dilwana",
      name: "Dilwana Courier",
      coverage: "domestic_bw",
      countries: ["BW"],
      integrationType: "tariff_table",
      pricingNote: "Fixed regional tariffs (Gaborone, Francistown, etc.).",
      sortOrder: 80,
      tariffs: [
        { countryCode: "BW", zone: "Gaborone local", serviceLabel: "0–1 kg", minWeightKg: 0, maxWeightKg: 1, price: 35, currency: "BWP", minDeliveryDays: 1, maxDeliveryDays: 3, sortOrder: 10 },
        { countryCode: "BW", zone: "Gaborone local", serviceLabel: "5–10 kg", minWeightKg: 5, maxWeightKg: 10, price: 60, currency: "BWP", minDeliveryDays: 1, maxDeliveryDays: 3, sortOrder: 20 },
        { countryCode: "BW", zone: "Francistown", serviceLabel: "0–5 kg", minWeightKg: 0, maxWeightKg: 5, price: 165, currency: "BWP", minDeliveryDays: 2, maxDeliveryDays: 5, sortOrder: 30 },
        { countryCode: "BW", zone: "Francistown", serviceLabel: "20–50 kg", minWeightKg: 20, maxWeightKg: 50, price: 365, currency: "BWP", minDeliveryDays: 3, maxDeliveryDays: 6, sortOrder: 40 },
      ],
    },
  ];

  const seededZaKeys = new Set<string>();

  for (const p of providers) {
    const prov = await CourierProvider.findOneAndUpdate(
      { slug: p.slug },
      {
        $set: {
          name: p.name,
          coverage: p.coverage,
          countries: p.countries,
          integrationType: p.integrationType,
          pricingNote: p.pricingNote,
          sortOrder: p.sortOrder,
          active: true,
        },
      },
      { upsert: true, new: true }
    );

    const keepLabels: string[] = [];
    for (const t of p.tariffs) {
      keepLabels.push(t.serviceLabel);
      const zone = t.zone?.trim() || undefined;
      await CourierTariff.updateOne(
        {
          providerId: prov._id,
          countryCode: t.countryCode,
          serviceLabel: t.serviceLabel,
          zone: zone ?? null,
        },
        {
          $set: {
            minWeightKg: t.minWeightKg,
            maxWeightKg: t.maxWeightKg,
            price: t.price,
            currency: t.currency,
            minDeliveryDays: t.minDeliveryDays,
            maxDeliveryDays: t.maxDeliveryDays,
            sortOrder: t.sortOrder,
            active: true,
          },
        },
        { upsert: true }
      );
      if (t.countryCode === "ZA") {
        seededZaKeys.add(`${String(prov._id)}::${t.serviceLabel}::${zone ?? ""}`);
      }
    }

    if (keepLabels.length) {
      await CourierTariff.updateMany(
        {
          providerId: prov._id,
          serviceLabel: { $nin: keepLabels },
        },
        { $set: { active: false } }
      );
    }
  }

  // Retire legacy ZA options (old PAXI labels, DeliverAI estimates) so checkout only shows current catalog.
  const legacySlugs = ["deliverai"];
  for (const slug of legacySlugs) {
    const legacy = await CourierProvider.findOne({ slug }).select("_id").lean();
    if (legacy) {
      await CourierTariff.updateMany(
        { providerId: legacy._id, countryCode: "ZA" },
        { $set: { active: false } }
      );
    }
  }

  // Deactivate any other stale ZA tariff not in this seed (e.g. renamed PAXI "Small bag").
  const zaProviders = await CourierProvider.find({
    slug: { $in: ["paxi", "courier-guy", "pudo"] },
    active: true,
  })
    .select("_id slug")
    .lean();
  for (const prov of zaProviders) {
    const tariffs = await CourierTariff.find({
      providerId: prov._id,
      countryCode: "ZA",
      active: true,
    })
      .select("serviceLabel zone")
      .lean();
    for (const t of tariffs) {
      const key = `${String(prov._id)}::${String(t.serviceLabel)}::${String(t.zone || "")}`;
      if (!seededZaKeys.has(key)) {
        await CourierTariff.updateOne({ _id: t._id }, { $set: { active: false } });
      }
    }
  }
}
