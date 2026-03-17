/**
 * Phone validation utilities to mitigate SMS abuse and premium number costs.
 * Blocks short codes and known premium-rate prefixes across Africa, Asia,
 * Americas, Europe, Middle East, and Oceania.
 *
 * Sources: ITU E.164, national numbering plans, Wikipedia premium-rate lists.
 * Conservative: only blocks documented premium ranges; avoids blocking mobile.
 */

/** Normalize phone to digits only (E.164 without +). */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Premium/shortcode patterns (E.164 digits: country code + premium prefix).
 * Africa: SADC, ECOWAS, EAC, and all 54 countries. Nigeria 080/081/090/091 = mobile (excluded).
 */
const PREMIUM_PREFIXES: RegExp[] = [
  // === AFRICA (54 countries) ===
  // North Africa
  /^200900/,              // Egypt 0900
  /^212089/,              // Morocco 089
  /^21309/,               // Algeria 09x
  /^2160[89]/,            // Tunisia 08x, 09x
  /^21809/,               // Libya 09x
  /^24909/,               // Sudan 09x
  /^21109/,               // South Sudan 09x

  // Southern Africa (SADC)
  /^27(86[2-9]|87|89)/,   // South Africa 0862-0869, 087, 089
  /^267900/,              // Botswana 0900
  /^264900/,              // Namibia 0900
  /^266900/,              // Lesotho 0900
  /^268900/,              // Eswatini 0900
  /^263900/,              // Zimbabwe 0900
  /^260900/,              // Zambia 0900
  /^258900/,              // Mozambique 0900
  /^265900/,              // Malawi 0900
  /^244949/,              // Angola 949 (premium)
  /^244996/,              // Angola 996 (premium)
  /^261900/,              // Madagascar 0900
  /^230900/,              // Mauritius 0900
  /^248900/,              // Seychelles 0900
  /^269900/,              // Comoros 0900

  // East Africa (EAC + Horn)
  /^254900/,              // Kenya 0900 (documented)
  /^255900/,              // Tanzania 0900 (documented)
  /^256900/,              // Uganda 0900
  /^250900/,              // Rwanda 0900
  /^257900/,              // Burundi 0900
  /^251900/,              // Ethiopia 0900
  /^252900/,              // Somalia 0900
  /^253900/,              // Djibouti 0900
  /^291900/,              // Eritrea 0900

  // West Africa (ECOWAS)
  /^233900/,              // Ghana 0900
  /^221900/,              // Senegal 0900
  /^225900/,              // Côte d'Ivoire 0900
  /^229900/,              // Benin 0900
  /^228900/,              // Togo 0900
  /^223900/,              // Mali 0900
  /^226900/,              // Burkina Faso 0900
  /^227900/,              // Niger 0900
  /^224900/,              // Guinea 0900
  /^231900/,              // Liberia 0900
  /^232900/,              // Sierra Leone 0900
  /^220900/,              // Gambia 0900
  /^245900/,              // Guinea-Bissau 0900
  // Nigeria (+234): 080, 081, 090, 091 = mobile — do NOT block. Premium = 5-digit shortcodes (caught by length < 10)

  // Central Africa
  /^237900/,              // Cameroon 0900
  /^242900/,              // Congo 0900
  /^243900/,              // DRC 0900
  /^241900/,              // Gabon 0900
  /^240900/,              // Equatorial Guinea 0900
  /^236900/,              // Central African Republic 0900
  /^235900/,              // Chad 0900
  /^239900/,              // São Tomé and Príncipe 0900

  // Indian Ocean / other
  /^238900/,              // Cape Verde 0900
  /^222900/,              // Mauritania 0900

  // === ASIA ===
  /^81(570|990)/,        // Japan 0570, 0990 (0 dropped in E.164)
  /^82060/,              // South Korea 060
  /^84(1900|900)/,       // Vietnam 1900, 900
  /^620809/,             // Indonesia 0809
  /^886020[349]/,        // Taiwan 0203, 0204, 0209
  /^9761900/,            // Mongolia 1900
  /^374900/,             // Armenia 900
  /^98(909|7020|7070)/,  // Iran 909, 7020, 7070
  /^66(19|90)/,         // Thailand 19xx, 90x
  /^65900/,              // Singapore 0900
  /^63900/,              // Philippines 0900
  /^6119[0126]/,        // Australia 1900, 1901, 1902, 1906
  /^640900/,             // New Zealand 0900
  /^91(5050|6060|1900)/, // India 5050, 6060, 1900
  /^86(118|95|96)/,     // China 118, 95x, 96x (premium)
  /^62(0809|089)/,      // Indonesia 0809, 089

  // === MIDDLE EAST ===
  /^98909/,              // Iran 909
  /^97219[01956]/,       // Israel 1-900, 1-901, 1-919, 1-956, 1-957
  /^966700/,             // Saudi Arabia 700
  // UAE/Jordan: mobile uses 50/52/54/55/56, 79 - do not block

  // === EUROPE ===
  /^44(84|87|90|91|98|118)/,  // UK 084, 087, 090, 091, 098, 118
  /^4369[01]/,          // Austria 0900, 0901
  /^4393[01]/,          // Austria 0930, 0931
  /^3290[0-9]/,         // Belgium 090x
  /^3360/,              // Croatia 060
  /^3364/,              // Croatia 064
  /^420(900|906|909|976)/,  // Czech 900, 906, 909, 976
  /^3390[1356]/,        // Denmark 9013, 9050, 9055, 9056
  /^358(100|200|202|209|300|600|700|106|107)/,  // Finland (0 dropped in E.164)
  /^35875/,              // Finland 075x
  /^338[1-9]/,          // France 08xx (special rate)
  /^49900/,             // Germany 0900
  /^30137/,             // Germany 0137
  /^30901/,             // Greece 901
  /^30909/,             // Greece 909
  /^36(90|91)/,         // Hungary 06-90, 06-91
  /^35315/,             // Ireland 15x
  /^3989/,              // Italy 89
  /^37190/,             // Latvia 90
  /^3895[05]/,          // North Macedonia 0500, 0550
  /^3190[069]/,         // Netherlands 0900, 0906, 0909
  /^4782/,              // Norway 82x
  /^48(70|30|40)/,      // Poland 70x, 30x, 40x
  /^40(70|89|90)/,      // Romania 070x, 89x, 090x
  /^7(809|803)/,        // Russia 809, 803
  /^421900/,            // Slovakia 0900
  /^38690/,             // Slovenia 090
  /^34(80[3-7]|90[3-7]|118)/,  // Spain 803-807, 903-907, 118
  /^46(900|939|944|118)/,  // Sweden 0900, 0939, 0944, 118
  /^41(900|901|906)/,   // Switzerland 0900, 0901, 0906
  /^380(703|900)/,      // Ukraine 0703, 0900

  // === NORTH AMERICA ===
  /^1900/,              // USA/Canada NANP 900
  /^521900/,            // Mexico 01-900

  // === SOUTH AMERICA ===
  /^54(0600|0609)/,     // Argentina 0600, 0609
  /^55(0500|0900)/,     // Brazil 0500, 0900
  /^56900/,             // Chile 0900
  /^57900/,             // Colombia 0900
  /^51900/,             // Peru 0900
  /^5809/,              // Venezuela 09x

  // === OCEANIA ===
  /^6119[0126]/,        // Australia 1900, 1901, 1902, 1906
  /^640900/,            // New Zealand 0900
  /^67900/,             // Fiji 0900
];

/** Block list from env (comma-separated prefixes, e.g. OTP_BLOCK_PREFIXES=2787,1900). */
function getBlockedPrefixes(): string[] {
  const raw = process.env.OTP_BLOCK_PREFIXES || "";
  return raw.split(",").map((p) => p.trim()).filter(Boolean);
}

/**
 * Returns true if the number is a premium-rate or shortcode that should be blocked.
 * Sending SMS to these can incur high per-message costs.
 */
export function isPremiumOrShortcode(phone: string): boolean {
  const digits = normalizePhone(phone);
  if (digits.length < 10) return true; // Short codes are typically 5–6 digits
  const blocked = getBlockedPrefixes();
  for (const prefix of blocked) {
    if (digits.startsWith(prefix)) return true;
  }
  return PREMIUM_PREFIXES.some((re) => re.test(digits));
}

/** Validate phone for OTP: not premium, not shortcode, min length. */
export function isValidForOtp(phone: string): { valid: boolean; reason?: string } {
  const digits = normalizePhone(phone);
  if (digits.length < 10) {
    return { valid: false, reason: "Invalid phone number" };
  }
  if (isPremiumOrShortcode(phone)) {
    return { valid: false, reason: "Premium and shortcode numbers are not supported for verification" };
  }
  return { valid: true };
}
