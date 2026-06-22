export type RunnerServiceCity = { id: string; name: string };
export type RunnerServiceCountry = { code: string; name: string; cities: RunnerServiceCity[] };

export const RUNNER_SERVICE_COUNTRIES: RunnerServiceCountry[] = [
  {
    code: "ZA",
    name: "South Africa",
    cities: [
      { id: "durban", name: "Durban" },
      { id: "pretoria", name: "Pretoria" },
      { id: "johannesburg", name: "Johannesburg" },
      { id: "cape_town", name: "Cape Town" },
    ],
  },
  {
    code: "BW",
    name: "Botswana",
    cities: [
      { id: "gaborone", name: "Gaborone" },
      { id: "francistown", name: "Francistown" },
    ],
  },
  {
    code: "ZM",
    name: "Zambia",
    cities: [
      { id: "lusaka", name: "Lusaka" },
      { id: "ndola", name: "Ndola" },
    ],
  },
  {
    code: "LS",
    name: "Lesotho",
    cities: [{ id: "maseru", name: "Maseru" }],
  },
  {
    code: "NA",
    name: "Namibia",
    cities: [{ id: "windhoek", name: "Windhoek" }],
  },
  {
    code: "ZW",
    name: "Zimbabwe",
    cities: [
      { id: "harare", name: "Harare" },
      { id: "bulawayo", name: "Bulawayo" },
    ],
  },
];

export function getCitiesForCountry(code: string): RunnerServiceCity[] {
  return RUNNER_SERVICE_COUNTRIES.find((c) => c.code === code)?.cities ?? [];
}
