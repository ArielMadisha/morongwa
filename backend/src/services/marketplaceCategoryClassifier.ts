const TOP_CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Women's Clothing": ["women", "woman", "lady", "ladies", "female", "dress", "blouse", "skirt", "leggings", "jumpsuit", "wedding"],
  "Pet Supplies": ["pet", "dog", "cat", "bird", "fish", "aquatic", "harness", "leash", "groom"],
  "Home, Garden & Furniture": ["home", "garden", "furniture", "kitchen", "bedding", "curtain", "storage", "dining"],
  "Health, Beauty & Hair": ["beauty", "makeup", "skin", "hair", "wig", "nail", "cosmetic", "facial"],
  "Jewelry & Watches": ["jewelry", "watch", "ring", "earring", "necklace", "bracelet", "pendant"],
  "Men's Clothing": ["men", "mens", "man's", "male", "gentlemen", "gents", "boy", "boys"],
  "Bags & Shoes": ["bag", "backpack", "wallet", "luggage", "handbag", "tote", "clutch"],
  "Women's Shoes": ["women", "woman", "lady", "female", "pump", "heel", "ballet", "wedge", "sandal", "slipper", "flat"],
  "Men's Shoes": ["men", "mens", "man", "male", "formal shoe", "loafer", "oxford", "sneaker", "boot", "sandal", "slipper"],
  "Camping Equipment": ["camp", "camping", "tent", "hiking", "backpack", "lantern", "sleeping bag", "outdoor cooking"],
  Agriculture: ["agriculture", "farm", "farming", "tractor", "seed", "fertilizer", "livestock", "crop", "irrigation", "poultry"],
  "Toys, Kids & Babies": ["toy", "baby", "kids", "child", "children", "maternity", "plush", "school bag"],
  "Sports & Outdoors": ["sport", "outdoor", "fitness", "swim", "cycling", "fishing", "jersey", "soccer", "football", "golf"],
  "Consumer Electronics": ["electronics", "camera", "audio", "video", "smart", "headphone", "speaker", "game"],
  "Home Improvement": ["lighting", "tool", "appliance", "welding", "power tool", "ceiling", "lamp", "garden tool"],
  "Automobiles & Motorcycles": ["car", "auto", "motor", "motorcycle", "vehicle", "dash", "gps", "seat cover"],
  "Phones & Accessories": ["phone", "mobile", "charger", "case", "screen protector", "sim", "iphone", "galaxy"],
  "Computer & Office": ["computer", "laptop", "tablet", "office", "printer", "scanner", "router", "ssd"],
};

const TOP_CATEGORY_SUBS: Record<string, string[]> = {
  "Women's Clothing": ["Lady Dresses", "Women's Camis", "Blouses & Shirts", "Cocktail Dresses", "Evening Dresses"],
  "Pet Supplies": ["Pet Toys", "Pet Beds", "Pet Collars", "Fish Tanks", "Pet Groomings"],
  "Home, Garden & Furniture": ["Furniture", "Kitchen, Dining & Bar", "Home Storage", "Curtains", "Bedding Sets"],
  "Health, Beauty & Hair": ["Makeup", "Skin Care", "Nail Art & Tools", "Wigs & Extensions", "Hair Styling"],
  "Jewelry & Watches": ["Necklace & Pendants", "Bracelets & Bangles", "Earrings", "Rings", "Women's Watches"],
  "Men's Clothing": ["Men's Shirts", "Men's Jackets", "Man Hoodies & Sweatshirts", "Man Jeans", "Men's Suits"],
  "Bags & Shoes": ["Fashion Backpacks", "Shoulder Bags", "Luggage & Travel Bags", "Crossbody Bags", "Evening Bags"],
  "Women's Shoes": ["Pumps", "Woman Boots", "Flats", "Woman Sandals", "Heels"],
  "Men's Shoes": ["Formal Shoes", "Man Boots", "Casual Shoes", "Sneakers", "Man Sandals"],
  "Camping Equipment": ["Camping & Hiking", "Tents", "Sleeping Bags", "Hiking Backpacks", "Camping Stoves"],
  Agriculture: ["Farm Tools", "Seeds & Seedlings", "Fertilizers", "Irrigation Equipment", "Livestock Supplies"],
  "Toys, Kids & Babies": ["Toys & Hobbies", "Baby Clothing", "Girls Clothing", "Boys Clothing", "Baby Care"],
  "Sports & Outdoors": ["Sportswear", "Cycling", "Fishing", "Swimming", "Golf"],
  "Consumer Electronics": ["Smart Electronics", "Camera & Photo", "Home Audio & Video", "Video Games", "Earphones & Headphones"],
  "Home Improvement": ["Tools", "Indoor Lighting", "Outdoor Lighting", "Home Appliances", "Power Tools"],
  "Automobiles & Motorcycles": ["Car Electronics", "Motorcycle Accessories & Parts", "Interior Accessories", "Auto Replacement Parts", "Exterior Accessories"],
  "Phones & Accessories": ["Mobile Phones", "Mobile Phone Accessories", "Cases & Covers", "Chargers", "Screen Protectors"],
  "Computer & Office": ["Laptops", "Tablets", "Printers", "Networking", "Storage Devices"],
};

export const MARKETPLACE_TOP_CATEGORIES = Object.keys(TOP_CATEGORY_KEYWORDS);
const TOPS = MARKETPLACE_TOP_CATEGORIES;

function escapeRegex(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text: string, term: string): boolean {
  const needle = String(term || "").trim().toLowerCase();
  if (!needle) return false;
  if (/^[a-z0-9]+(?:['-][a-z0-9]+)*$/i.test(needle)) {
    return new RegExp(`\\b${escapeRegex(needle)}\\b`, "i").test(text);
  }
  return text.includes(needle);
}

function blob(p: { title?: unknown; description?: unknown; categories?: unknown; tags?: unknown }): string {
  const categories = Array.isArray(p.categories) ? p.categories.map((v) => String(v || "")) : [];
  const tags = Array.isArray(p.tags) ? p.tags.map((v) => String(v || "")) : [];
  return [String(p.title || ""), String(p.description || ""), ...categories, ...tags].join(" ").toLowerCase();
}

export function inferTopCategoryForProduct(p: {
  title?: unknown;
  description?: unknown;
  categories?: unknown;
  tags?: unknown;
}): string | null {
  const text = blob(p);
  if (!text.trim()) return null;
  let best: { name: string; score: number } | null = null;
  for (const top of TOPS) {
    const subs = TOP_CATEGORY_SUBS[top] ?? [];
    const keys = TOP_CATEGORY_KEYWORDS[top] ?? [];
    const subScore = subs.reduce((acc, s) => (containsTerm(text, s) ? acc + 2 : acc), 0);
    const keyScore = keys.reduce((acc, k) => (containsTerm(text, k) ? acc + 1 : acc), 0);
    let score = subScore + keyScore;
    if (top === "Women's Clothing" && /\b(men|man)\b/i.test(text)) score -= 3;
    if (top === "Men's Clothing" && /\b(women|woman|lady|girls)\b/i.test(text)) score -= 3;
    if (top === "Women's Shoes" && /\b(men|man|boy|boys)\b/i.test(text)) score -= 3;
    if (top === "Men's Shoes" && /\b(women|woman|lady|girls)\b/i.test(text)) score -= 3;
    if (!best || score > best.score) best = { name: top, score };
  }
  if (!best || best.score < 1) return null;
  return best.name;
}
