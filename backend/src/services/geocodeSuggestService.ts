/**
 * Address autocomplete backend for South Africa (Photon + Nominatim).
 * Mounted on GET /api/pricing/address-suggest so it ships with an always-live route.
 */
import { Request, Response } from "express";
import rateLimit from "express-rate-limit";

export const geocodeSuggestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  message: "Too many address lookups. Please wait a moment and try again.",
  standardHeaders: true,
  legacyHeaders: false,
});

const NOMINATIM_UA = "Qwertymates/1.0 (+https://www.qwertymates.com)";

function expandQueries(q: string): string[] {
  const t = q.trim().slice(0, 200);
  if (!t) return [];
  const s = new Set<string>();
  s.add(t);
  s.add(t.includes("South Africa") || /\bSA\b/.test(t) ? t : `${t}, South Africa`);
  const afterDigit = t.replace(/^(\d+)([A-Za-z])/, "$1 $2");
  s.add(afterDigit);
  s.add(afterDigit.includes("South Africa") ? afterDigit : `${afterDigit}, South Africa`);
  s.add(afterDigit.replace(/witchhazel/gi, "witch hazel"));
  s.add(
    afterDigit.replace(/witchhazel/gi, "witch hazel").includes("South Africa")
      ? afterDigit.replace(/witchhazel/gi, "witch hazel")
      : `${afterDigit.replace(/witchhazel/gi, "witch hazel")}, South Africa`
  );
  if (/^\d+\s+witch$/i.test(afterDigit.trim())) {
    const b = afterDigit.trim();
    s.add(`${b} hazel, South Africa`);
    s.add(`${b} hazel avenue, South Africa`);
    s.add(`${b} hazel ave, South Africa`);
    s.add(`${b} hazel avenue, Centurion, South Africa`);
    s.add(`${b} hazel avenue, Pretoria, South Africa`);
  }

  // Short / prefix-style queries (1–3 chars): Photon needs city or street context — same idea as Google Maps narrowing.
  if (t.length <= 3) {
    const cities = [
      "Pretoria",
      "Johannesburg",
      "Centurion",
      "Cape Town",
      "Durban",
      "Sandton",
      "Midrand",
      "Bloemfontein",
      "Port Elizabeth",
    ];
    for (const c of cities) {
      s.add(`${t} ${c}`);
      s.add(`${t} ${c} South Africa`);
    }
    if (/^\d{1,4}$/.test(t)) {
      s.add(`${t} street`);
      s.add(`${t} avenue`);
      s.add(`no ${t}`);
      s.add(`${t} main`);
    }
    if (/^[a-zA-Z]$/.test(t)) {
      s.add(`${t} street`);
      s.add(`${t} road`);
      s.add(`${t} avenue`);
      s.add(`${t} lane`);
    }
  }

  return [...s].slice(0, 22);
}

function primaryNominatimQuery(q: string): string {
  const t = q.trim();
  if (t.length === 1 && /^[a-zA-Z]$/.test(t)) {
    return `${t} street, Pretoria, South Africa`;
  }
  if (/^\d{1,4}$/.test(t)) {
    return `${t} Pretoria, South Africa`;
  }
  const spaced = t.replace(/^(\d+)([A-Za-z])/, "$1 $2");
  if (/^\d+\s+witch$/i.test(spaced)) {
    return `${spaced.trim()} hazel, South Africa`;
  }
  if (/witchhazel/i.test(t)) {
    const w = spaced.replace(/witchhazel/gi, "witch hazel");
    return w.includes("South Africa") ? w : `${w}, South Africa`;
  }
  return t.includes("South Africa") ? t : `${t}, South Africa`;
}

async function nominatimSearch(q: string): Promise<any[]> {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q,
      format: "json",
      addressdetails: "1",
      limit: "15",
      countrycodes: "za",
    }).toString();
  const res = await fetch(url, {
    headers: {
      "User-Agent": NOMINATIM_UA,
      Accept: "application/json",
      "Accept-Language": "en",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function photonSearch(q: string, limit: string): Promise<any[]> {
  const url =
    "https://photon.komoot.io/api/?" +
    new URLSearchParams({
      q,
      limit,
      lang: "en",
      lat: "-25.86",
      lon: "28.18",
    }).toString();
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as { features?: unknown };
  const features = json?.features;
  return Array.isArray(features) ? (features as any[]) : [];
}

function dedupeNominatim(rows: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of rows) {
    const id = item?.place_id != null ? `p:${item.place_id}` : `c:${item.lat},${item.lon}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
    if (out.length >= 20) break;
  }
  return out;
}

function dedupePhoton(features: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const f of features) {
    const c = f?.geometry?.coordinates;
    const id = Array.isArray(c) ? `${c[0]},${c[1]}` : JSON.stringify(f?.properties || {});
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(f);
    if (out.length >= 32) break;
  }
  return out;
}

function preferZaPhoton(features: any[]): any[] {
  const za = features.filter((f) => {
    const cc = String(f?.properties?.countrycode || "").toLowerCase();
    const cname = String(f?.properties?.country || "").toLowerCase();
    return cc === "za" || cname.includes("south africa");
  });
  return za.length > 0 ? za : features;
}

export async function geocodeSuggestHandler(req: Request, res: Response): Promise<void> {
  try {
    const q = String(req.query.q || "")
      .trim()
      .slice(0, 200);
    if (q.length < 1) {
      res.json({ success: true, nominatim: [], photon: [] });
      return;
    }

    const variants = expandQueries(q);
    const photonLimit = q.length <= 3 ? "18" : "12";
    const photonCap = q.length <= 3 ? 10 : 6;
    const photonLists = await Promise.all(
      variants.slice(0, photonCap).map((v) => photonSearch(v, photonLimit))
    );
    let photonFlat = dedupePhoton(preferZaPhoton(photonLists.flat()));
    if (photonFlat.length < 4 && q.length <= 3) {
      const extra = await photonSearch(`${q}, South Africa`, "20");
      photonFlat = dedupePhoton(preferZaPhoton([...photonFlat, ...extra]));
    }

    let nom = dedupeNominatim(await nominatimSearch(primaryNominatimQuery(q)));
    const skipExtraNominatim = photonFlat.length >= 8 && q.length <= 2;
    if (nom.length === 0 && !skipExtraNominatim) {
      await new Promise((r) => setTimeout(r, 1100));
      const fallback = q.includes("South Africa") ? q : `${q}, South Africa`;
      nom = dedupeNominatim([...nom, ...(await nominatimSearch(fallback))]);
    }
    if (nom.length === 0 && variants.length > 1 && !skipExtraNominatim) {
      await new Promise((r) => setTimeout(r, 1100));
      nom = dedupeNominatim([...nom, ...(await nominatimSearch(variants[1]))]);
    }

    res.json({ success: true, nominatim: nom, photon: photonFlat });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Suggest failed" });
  }
}
