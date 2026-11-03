import fs from "node:fs";
import path from "node:path";
import { toCsv } from "./csv";
import { FILES, toIsoDate, DAY_MS } from "./validate";

/**
 * Made-up sample data. Every price is invented and carries the source "sample".
 * Nothing here comes from a real shop, and no saving it shows is real.
 */

type Spec = [name: string, category: string, unit: "kg" | "L" | "each", sizes: number[], perUnitMinor: number, aliases: string[]];

const ITEMS: Spec[] = [
  ["Milk", "dairy", "L", [1], 110, ["whole milk", "semi skimmed milk", "skimmed milk", "fresh milk"]],
  ["Oat milk", "dairy", "L", [1], 190, ["oat drink"]],
  ["Butter", "dairy", "kg", [0.25, 0.5], 800, ["salted butter", "unsalted butter"]],
  ["Cheddar", "dairy", "kg", [0.25, 0.4], 1000, ["cheddar cheese", "cheese"]],
  ["Mozzarella", "dairy", "kg", [0.125, 0.2], 900, ["mozzarella cheese"]],
  ["Parmesan", "dairy", "kg", [0.15], 2200, ["parmesan cheese"]],
  ["Plain yogurt", "dairy", "kg", [0.5], 300, ["natural yogurt", "yoghurt", "plain yoghurt"]],
  ["Greek yogurt", "dairy", "kg", [0.5], 480, ["greek yoghurt"]],
  ["Cream", "dairy", "L", [0.25], 700, ["single cream", "whipping cream"]],
  ["Egg", "dairy", "each", [12], 30, ["eggs", "dozen eggs", "free range eggs"]],
  ["White bread", "bakery", "each", [1], 150, ["bread", "white loaf", "sliced bread"]],
  ["Wholemeal bread", "bakery", "each", [1], 170, ["brown bread", "whole wheat bread"]],
  ["Bagel", "bakery", "each", [5], 60, ["bagels"]],
  ["Tortilla wrap", "bakery", "each", [8], 45, ["wraps", "tortillas"]],
  ["Croissant", "bakery", "each", [4], 55, ["croissants"]],
  ["Banana", "produce", "kg", [1], 160, ["bananas"]],
  ["Apple", "produce", "kg", [1, 1.5], 240, ["apples"]],
  ["Orange", "produce", "kg", [1], 210, ["oranges"]],
  ["Lemon", "produce", "kg", [0.5], 320, ["lemons"]],
  ["Tomato", "produce", "kg", [0.5, 1], 330, ["tomatoes"]],
  ["Cucumber", "produce", "each", [1], 80, ["cucumbers"]],
  ["Potato", "produce", "kg", [2, 2.5], 100, ["potatoes"]],
  ["Onion", "produce", "kg", [1], 130, ["onions", "brown onions"]],
  ["Carrot", "produce", "kg", [1], 110, ["carrots"]],
  ["Broccoli", "produce", "each", [1], 110, []],
  ["Lettuce", "produce", "each", [1], 100, ["iceberg lettuce"]],
  ["Bell pepper", "produce", "kg", [0.5], 380, ["peppers", "red pepper"]],
  ["Mushroom", "produce", "kg", [0.25, 0.4], 600, ["mushrooms"]],
  ["Garlic", "produce", "each", [1], 60, ["garlic bulb"]],
  ["Spinach", "produce", "kg", [0.2], 900, ["baby spinach"]],
  ["Avocado", "produce", "each", [2], 90, ["avocados"]],
  ["Grapes", "produce", "kg", [0.5], 550, ["seedless grapes"]],
  ["Strawberry", "produce", "kg", [0.4], 700, ["strawberries"]],
  ["Zucchini", "produce", "kg", [0.5], 270, ["courgette", "courgettes"]],
  ["Chicken breast", "meat", "kg", [0.5, 1], 820, ["chicken fillet", "chicken"]],
  ["Minced beef", "meat", "kg", [0.5], 1000, ["ground beef", "beef mince"]],
  ["Pork chop", "meat", "kg", [0.5], 750, ["pork chops"]],
  ["Bacon", "meat", "kg", [0.2], 1500, ["streaky bacon"]],
  ["Sausage", "meat", "kg", [0.4], 900, ["sausages", "pork sausages"]],
  ["Ham", "meat", "kg", [0.15], 1600, ["sliced ham"]],
  ["Salmon fillet", "fish", "kg", [0.25], 2200, ["salmon"]],
  ["Canned tuna", "fish", "each", [1], 140, ["tuna", "tinned tuna"]],
  ["Pasta", "pantry", "kg", [0.5], 180, ["penne", "fusilli"]],
  ["Spaghetti", "pantry", "kg", [0.5], 170, []],
  ["Rice", "pantry", "kg", [1], 250, ["white rice", "long grain rice"]],
  ["Flour", "pantry", "kg", [1], 90, ["plain flour"]],
  ["Sugar", "pantry", "kg", [1], 110, ["white sugar"]],
  ["Salt", "pantry", "kg", [0.75], 60, ["table salt"]],
  ["Olive oil", "pantry", "L", [0.5, 1], 900, ["extra virgin olive oil"]],
  ["Sunflower oil", "pantry", "L", [1], 300, ["cooking oil", "vegetable oil"]],
  ["Canned tomatoes", "pantry", "kg", [0.4], 220, ["chopped tomatoes", "tinned tomatoes"]],
  ["Baked beans", "pantry", "kg", [0.4], 260, []],
  ["Chickpeas", "pantry", "kg", [0.4], 280, ["canned chickpeas"]],
  ["Cornflakes", "pantry", "kg", [0.5], 520, ["cereal", "breakfast cereal"]],
  ["Oats", "pantry", "kg", [0.5, 1], 220, ["porridge oats", "rolled oats"]],
  ["Peanut butter", "pantry", "kg", [0.35], 750, []],
  ["Jam", "pantry", "kg", [0.35], 550, ["strawberry jam"]],
  ["Honey", "pantry", "kg", [0.35], 1400, []],
  ["Tea bags", "pantry", "each", [80], 5, ["tea"]],
  ["Ground coffee", "pantry", "kg", [0.25], 1900, ["coffee"]],
  ["Instant coffee", "pantry", "kg", [0.1], 4500, []],
  ["Ketchup", "pantry", "kg", [0.5], 400, ["tomato ketchup"]],
  ["Mayonnaise", "pantry", "kg", [0.4], 700, ["mayo"]],
  ["Mustard", "pantry", "kg", [0.2], 800, []],
  ["Soy sauce", "pantry", "L", [0.15], 1300, []],
  ["Pasta sauce", "pantry", "kg", [0.4], 450, ["tomato sauce"]],
  ["Frozen peas", "frozen", "kg", [0.9], 260, ["peas"]],
  ["Frozen pizza", "frozen", "each", [1], 300, ["pizza"]],
  ["Ice cream", "frozen", "L", [1], 450, ["vanilla ice cream"]],
  ["Fish fingers", "frozen", "kg", [0.45], 800, []],
  ["Frozen chips", "frozen", "kg", [1], 220, ["oven chips", "fries"]],
  ["Orange juice", "drinks", "L", [1], 190, ["oj"]],
  ["Apple juice", "drinks", "L", [1], 160, []],
  ["Sparkling water", "drinks", "L", [1.5], 50, ["soda water", "fizzy water"]],
  ["Still water", "drinks", "L", [1.5, 6], 35, ["water", "bottled water"]],
  ["Cola", "drinks", "L", [1.5, 2], 120, ["coke"]],
  ["Lemonade", "drinks", "L", [2], 80, []],
  ["Toilet paper", "household", "each", [9], 40, ["toilet roll", "loo roll"]],
  ["Kitchen roll", "household", "each", [2], 160, ["paper towels"]],
  ["Dishwasher tablets", "household", "each", [30], 15, ["dishwasher tabs"]],
  ["Laundry detergent", "household", "L", [1.5], 400, ["washing liquid", "laundry liquid"]],
  ["Washing-up liquid", "household", "L", [0.5], 350, ["dish soap", "dish liquid"]],
  ["Toothpaste", "household", "each", [1], 220, []],
  ["Shampoo", "household", "L", [0.3], 1100, []],
  ["Hand soap", "household", "each", [1], 180, ["soap"]],
  ["Bin bags", "household", "each", [20], 12, ["rubbish bags", "trash bags"]],
  ["Sponges", "household", "each", [4], 50, ["scourers"]],
  ["Dark chocolate", "snacks", "kg", [0.1], 2800, ["chocolate"]],
  ["Biscuits", "snacks", "kg", [0.3], 900, ["cookies", "digestive biscuits"]],
  ["Crisps", "snacks", "kg", [0.18], 1800, ["potato chips"]],
  ["Mixed nuts", "snacks", "kg", [0.2], 1900, ["nuts"]],
  ["Popcorn", "snacks", "kg", [0.1], 2500, []],
  ["Tofu", "pantry", "kg", [0.28], 900, []],
  ["Lentils", "pantry", "kg", [0.5], 330, ["red lentils"]],
  ["Couscous", "pantry", "kg", [0.5], 280, []],
  ["Breadcrumbs", "pantry", "kg", [0.25], 600, []],
  ["Vinegar", "pantry", "L", [0.5], 250, ["white vinegar"]],
  ["Black pepper", "pantry", "kg", [0.05], 9000, ["pepper"]],
  ["Rice cakes", "snacks", "each", [1], 150, []],
  ["Margarine", "dairy", "kg", [0.45], 450, ["spread"]],
  ["Pita bread", "bakery", "each", [6], 40, ["pitta"]],
  ["Hummus", "pantry", "kg", [0.2], 1500, ["houmous"]],
  ["Red onion", "produce", "kg", [0.5], 250, []],
  ["Sweet potato", "produce", "kg", [1], 220, ["sweet potatoes"]],
  ["Cauliflower", "produce", "each", [1], 130, []],
  ["Pear", "produce", "kg", [1], 270, ["pears"]],
];

const BRANDS: [name: string, factor: number][] = [
  ["Store Own", 0.9],
  ["Sample Brand", 1.15],
  ["Demo Co", 1.0],
];

interface ChainSpec {
  chain: string;
  factor: number;
  coverage: number;
}

const CHAINS: ChainSpec[] = [
  { chain: "Sample Mart", factor: 1.0, coverage: 0.85 },
  { chain: "Demo Discount", factor: 0.88, coverage: 0.65 },
  { chain: "Example Fresh", factor: 1.12, coverage: 0.85 },
  { chain: "Test Market", factor: 0.97, coverage: 0.8 },
  { chain: "Fake Grocer", factor: 1.05, coverage: 0.8 },
];

/** Shops by area: [chain index, dLat, dLng] around the area centre. */
const SHOPS: Record<string, { center: { lat: number; lng: number }; list: [number, number, number][] }> = {
  "sample-town": {
    center: { lat: 10.0, lng: -30.0 },
    list: [
      [0, 0.004, 0.003],
      [1, -0.012, 0.01],
      [2, 0.016, -0.006],
      [3, -0.008, -0.02],
      [4, 0.03, 0.025],
    ],
  },
  "sample-village": {
    center: { lat: 20.0, lng: -40.0 },
    list: [
      [0, 0.006, -0.004],
      [1, -0.015, 0.012],
      [3, 0.02, 0.018],
      [4, -0.01, -0.025],
    ],
  },
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SAMPLE_LABEL =
  "SAMPLE DATA. Every shop, product and price in this folder is made up. None of it comes from a real shop.";

export function generateSample(outDir: string, now = new Date(), currency = "EUR"): { shops: number; items: number; products: number; prices: number } {
  const rand = mulberry32(42);
  fs.mkdirSync(outDir, { recursive: true });
  const day = (offset: number) => toIsoDate(new Date(now.getTime() + offset * DAY_MS));

  const shopRows: (string | number | boolean)[][] = [];
  const shopIds: string[] = [];
  const shopFactor = new Map<string, ChainSpec>();
  let n = 0;
  for (const [areaId, def] of Object.entries(SHOPS)) {
    for (const [ci, dLat, dLng] of def.list) {
      n++;
      const c = CHAINS[ci];
      const id = `s${String(n).padStart(2, "0")}`;
      shopIds.push(id);
      shopFactor.set(id, c);
      shopRows.push([
        id,
        `${c.chain} (sample)`,
        c.chain,
        `${n} Made-up Street`,
        +(def.center.lat + dLat).toFixed(5),
        +(def.center.lng + dLng).toFixed(5),
        areaId,
        true,
      ]);
    }
  }

  const itemRows: (string | number | boolean)[][] = [];
  const aliasRows: (string | number | boolean)[][] = [];
  const productRows: (string | number | boolean)[][] = [];
  const productInfo: { id: string; base: number }[] = [];
  let pn = 0;
  ITEMS.forEach((spec, i) => {
    const [name, category, unit, sizes, perUnit, aliases] = spec;
    // The band is narrow, about 15% either side of the usual pack. Bigger packs in the data
    // are out of band on purpose, so a bulk pack never wins when you wanted a normal one.
    const min = +(sizes[0] * 0.85).toFixed(3);
    const max = +(sizes[0] * 1.15).toFixed(3);
    const itemId = `i${String(i + 1).padStart(3, "0")}`;
    itemRows.push([itemId, name, category, unit, min, max]);
    aliases.forEach((a) => aliasRows.push([itemId, a]));
    sizes.forEach((size, si) => {
      const brandCount = si === 0 ? 2 : 1;
      for (let b = 0; b < brandCount; b++) {
        pn++;
        const productId = `p${String(pn).padStart(4, "0")}`;
        const [brand, brandFactor] = BRANDS[b + (i % 2)] ?? BRANDS[b];
        const sizeFactor = si === 0 ? 1 : 0.94;
        productRows.push([productId, itemId, brand, size, ""]);
        productInfo.push({ id: productId, base: perUnit * size * brandFactor * sizeFactor });
      }
    });
  });

  const priceRows: (string | number | boolean)[][] = [];
  for (const shopId of shopIds) {
    const chain = shopFactor.get(shopId)!;
    for (const p of productInfo) {
      if (rand() > chain.coverage) continue;
      const noise = 0.92 + rand() * 0.16;
      let amount = Math.max(10, Math.round(p.base * chain.factor * noise));
      const roll = rand();
      let age = Math.floor(rand() * 11);
      let isPromo = false;
      let promoEnds = "";
      if (roll < 0.04) age = 16 + Math.floor(rand() * 10); // stale on purpose
      else if (roll < 0.07) {
        isPromo = true;
        amount = Math.max(10, Math.round(amount * 0.8));
        promoEnds = day(2 + Math.floor(rand() * 4));
      } else if (roll < 0.08) {
        isPromo = true;
        amount = Math.max(10, Math.round(amount * 0.7));
        promoEnds = day(-1); // ended yesterday
      }
      if (rand() < 0.1) {
        // an older observation, so the history has more than one row
        priceRows.push([p.id, shopId, Math.max(10, Math.round(amount * (0.9 + rand() * 0.2))), currency, false, "", day(-(age + 7 + Math.floor(rand() * 5))), "sample"]);
      }
      priceRows.push([p.id, shopId, amount, currency, isPromo, promoEnds, day(-age), "sample"]);
    }
  }

  const write = (key: keyof typeof FILES, rows: (string | number | boolean)[][]) =>
    fs.writeFileSync(path.join(outDir, FILES[key].file), toCsv([...FILES[key].headers], rows));
  write("shops", shopRows);
  write("items", itemRows);
  write("aliases", aliasRows);
  write("products", productRows);
  write("prices", priceRows);
  fs.writeFileSync(path.join(outDir, "SAMPLE-DATA.txt"), SAMPLE_LABEL + "\n");
  return { shops: shopRows.length, items: itemRows.length, products: productRows.length, prices: priceRows.length };
}
