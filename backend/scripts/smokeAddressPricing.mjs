const base = (process.env.SMOKE_API_BASE || "https://api.qwertymates.com/api").replace(/\/$/, "");

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function haversineKm(aLon, aLat, bLon, bLat) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function getJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function suggest(q) {
  const url = `${base}/pricing/address-suggest?q=${encodeURIComponent(q)}`;
  const body = await getJson(url);
  const nom = Array.isArray(body?.nominatim) ? body.nominatim : [];
  const ph = Array.isArray(body?.photon) ? body.photon : [];
  const firstNom = nom[0];
  if (firstNom?.lat != null && firstNom?.lon != null) {
    return {
      address: firstNom.display_name || q,
      lat: Number(firstNom.lat),
      lon: Number(firstNom.lon),
      source: "nominatim",
    };
  }
  const firstPh = ph[0];
  const coords = firstPh?.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    return {
      address:
        [firstPh?.properties?.housenumber, firstPh?.properties?.street, firstPh?.properties?.city, firstPh?.properties?.country]
          .filter(Boolean)
          .join(", ") || q,
      lat: Number(coords[1]),
      lon: Number(coords[0]),
      source: "photon",
    };
  }
  throw new Error(`No address suggestion match for "${q}"`);
}

async function quote(distanceKm) {
  const body = await getJson(`${base}/pricing/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      currency: "ZAR",
      distanceKm,
      taskType: "collect_send",
      deliveryMethod: "taxi",
      itemCount: 1,
      waitingRequired: false,
      urgency: "normal",
      weightKg: 5,
      actualWeightKg: 5,
      lengthCm: 40,
      widthCm: 30,
      heightCm: 20,
      isPeak: false,
      isUrgent: false,
    }),
  });
  return body?.data || null;
}

(async () => {
  const pickupInput = process.env.SMOKE_PICKUP || "204 Witch Hazel Avenue, Centurion";
  const deliveryInput = process.env.SMOKE_DELIVERY || "1 Sandton Drive, Sandton";
  console.log("=== Smoke: Address + Distance + Pricing ===");
  console.log("API:", base);
  console.log("Pickup input:", pickupInput);
  console.log("Delivery input:", deliveryInput);

  const pickup = await suggest(pickupInput);
  const delivery = await suggest(deliveryInput);
  const distanceKm = haversineKm(pickup.lon, pickup.lat, delivery.lon, delivery.lat);
  const roundedDistance = Math.round(distanceKm * 100) / 100;
  const pricing = await quote(roundedDistance);

  const checks = [
    { name: "pickup resolved", ok: toNum(pickup.lat) !== null && toNum(pickup.lon) !== null },
    { name: "delivery resolved", ok: toNum(delivery.lat) !== null && toNum(delivery.lon) !== null },
    { name: "distance is computed", ok: roundedDistance >= 0 },
    { name: "pricing returned", ok: !!pricing },
    { name: "client total > 0", ok: Number(pricing?.totalClientPrice || pricing?.clientTotal || 0) > 0 },
    { name: "runner payout > 0", ok: Number(pricing?.runnerPayout || pricing?.runnerNet || 0) > 0 },
  ];
  checks.forEach((c) => console.log(`${c.ok ? "PASS" : "FAIL"} - ${c.name}`));

  console.log("--- Results ---");
  console.log("Pickup resolved:", pickup.address, `(${pickup.source})`);
  console.log("Delivery resolved:", delivery.address, `(${delivery.source})`);
  console.log("Distance (km):", roundedDistance);
  if (roundedDistance === 0) {
    console.log("WARN - distance is 0km (addresses may resolve to same point).");
  }
  console.log("Task amount (runner):", pricing?.taskPrice);
  console.log("Total client price:", pricing?.totalClientPrice ?? pricing?.clientTotal);
  console.log("Platform fee:", pricing?.platformFee ?? pricing?.commission);

  if (checks.some((c) => !c.ok)) process.exit(1);
})();
