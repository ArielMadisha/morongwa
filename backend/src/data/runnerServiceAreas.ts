/** Runner service countries + wholesale / parcel hub cities (centroid coords for radius matching). */
export type RunnerServiceCity = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type RunnerServiceCountry = {
  code: string;
  name: string;
  currency: "ZAR" | "BWP" | "ZMW" | "LSL" | "NAD" | "ZWL";
  cities: RunnerServiceCity[];
};

export const RUNNER_SERVICE_COUNTRIES: RunnerServiceCountry[] = [
  {
    code: "ZA",
    name: "South Africa",
    currency: "ZAR",
    cities: [
      { id: "durban", name: "Durban", lat: -29.8587, lng: 31.0218 },
      { id: "pretoria", name: "Pretoria", lat: -25.7479, lng: 28.2293 },
      { id: "johannesburg", name: "Johannesburg", lat: -26.2041, lng: 28.0473 },
      { id: "cape_town", name: "Cape Town", lat: -33.9249, lng: 18.4241 },
    ],
  },
  {
    code: "BW",
    name: "Botswana",
    currency: "BWP",
    cities: [
      { id: "gaborone", name: "Gaborone", lat: -24.6282, lng: 25.9231 },
      { id: "francistown", name: "Francistown", lat: -21.1702, lng: 27.5078 },
    ],
  },
  {
    code: "ZM",
    name: "Zambia",
    currency: "ZMW",
    cities: [
      { id: "lusaka", name: "Lusaka", lat: -15.3875, lng: 28.3228 },
      { id: "ndola", name: "Ndola", lat: -12.9587, lng: 28.6366 },
    ],
  },
  {
    code: "LS",
    name: "Lesotho",
    currency: "LSL",
    cities: [{ id: "maseru", name: "Maseru", lat: -29.3151, lng: 27.4869 }],
  },
  {
    code: "NA",
    name: "Namibia",
    currency: "NAD",
    cities: [{ id: "windhoek", name: "Windhoek", lat: -22.5609, lng: 17.0658 }],
  },
  {
    code: "ZW",
    name: "Zimbabwe",
    currency: "ZWL",
    cities: [
      { id: "harare", name: "Harare", lat: -17.8252, lng: 31.0335 },
      { id: "bulawayo", name: "Bulawayo", lat: -20.1325, lng: 28.6265 },
    ],
  },
];

export function getRunnerServiceCountry(code: string | undefined | null): RunnerServiceCountry | undefined {
  const c = String(code || "").trim().toUpperCase();
  return RUNNER_SERVICE_COUNTRIES.find((x) => x.code === c);
}

export function getRunnerServiceCity(countryCode: string | undefined | null, cityId: string | undefined | null): RunnerServiceCity | undefined {
  const country = getRunnerServiceCountry(countryCode);
  if (!country) return undefined;
  const id = String(cityId || "").trim().toLowerCase();
  return country.cities.find((c) => c.id === id || c.name.toLowerCase() === id);
}
