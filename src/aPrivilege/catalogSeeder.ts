import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import Product from "../models/Product";
import Restaurant from "../models/Restaurant";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import { CATEGORY_SLUGS } from "../types/catalog.types";

/**
 * The demo catalogue, carried over from the client's mock data so the
 * category pages can be pointed at the API without the shelves emptying.
 *
 * Image paths stay relative (`/mock/...`) because the files are served by
 * the client from its own /public. When real photographs arrive they move to
 * Cloudinary and these become absolute URLs — nothing else has to change.
 *
 * TODO(catalog): this is demo stock with no merchant attached. Real listings
 * arrive through POST /api/products/merchant/stock, which stamps ownership
 * from the caller's token.
 */

const FRESH = [
  {
    productId: "fresh-tomato",
    name: "Tomato",
    image: "https://images.pexels.com/photos/533280/pexels-photo-533280.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "seasonal-vegetables",
    origin: "Dergaon farms",
    variants: [
      { variantId: "250g", label: "250 g", price: 14, stockCount: 48 },
      { variantId: "500g", label: "500 g", price: 26, stockCount: 31 },
      { variantId: "1kg", label: "1 kg", price: 48, stockCount: 12 },
    ],
  },
  {
    productId: "fresh-potato",
    name: "Potato",
    image: "https://images.pexels.com/photos/4110464/pexels-photo-4110464.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "seasonal-vegetables",
    origin: "Golaghat mandi",
    variants: [
      { variantId: "1kg", label: "1 kg", price: 32, stockCount: 60 },
      { variantId: "2kg", label: "2 kg", price: 60, stockCount: 24 },
      { variantId: "5kg", label: "5 kg", price: 142, stockCount: 7 },
    ],
  },
  {
    productId: "fresh-lau",
    name: "Bottle gourd (Lau)",
    image: "https://images.pexels.com/photos/39130946/pexels-photo-39130946.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "seasonal-vegetables",
    origin: "Telgaram growers",
    variants: [
      { variantId: "half", label: "Half piece", price: 18, stockCount: 14 },
      { variantId: "whole", label: "Whole (~1 kg)", price: 34, stockCount: 9 },
    ],
  },
  {
    productId: "fresh-spinach",
    name: "Spinach (Palak)",
    image: "https://images.pexels.com/photos/6824476/pexels-photo-6824476.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "leafy-greens-herbs",
    origin: "Cut this morning",
    variants: [
      { variantId: "bundle", label: "1 bundle", price: 20, stockCount: 22 },
      { variantId: "2bundle", label: "2 bundles", price: 36, stockCount: 11 },
    ],
  },
  {
    productId: "fresh-rohu",
    name: "Rohu fish",
    image: "https://images.pexels.com/photos/14062105/pexels-photo-14062105.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "fresh-fish",
    origin: "Brahmaputra catch",
    variants: [
      { variantId: "500g", label: "500 g, cut", price: 130, stockCount: 8 },
      { variantId: "1kg", label: "1 kg, cut", price: 250, stockCount: 5 },
      {
        variantId: "whole",
        label: "Whole (~1.5 kg)",
        price: 360,
        stockCount: 3,
      },
    ],
  },
  {
    productId: "fresh-chicken",
    name: "Country chicken",
    image: "https://images.pexels.com/photos/6107725/pexels-photo-6107725.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "chicken-duck-mutton",
    origin: "Local poultry, same-day",
    variants: [
      {
        variantId: "half",
        label: "Half kg, curry cut",
        price: 160,
        stockCount: 10,
      },
      {
        variantId: "1kg",
        label: "1 kg, curry cut",
        price: 310,
        stockCount: 4,
      },
    ],
  },
  {
    productId: "fresh-duck",
    name: "Duck",
    image: "https://images.pexels.com/photos/11355643/pexels-photo-11355643.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "chicken-duck-mutton",
    origin: "Pre-order, dressed",
    // Sold out — keeps the out-of-stock path exercised against real data.
    variants: [
      {
        variantId: "whole",
        label: "Whole, dressed",
        price: 540,
        stockCount: 0,
      },
    ],
  },
  {
    productId: "fresh-eggs",
    name: "Farm eggs",
    image: "https://images.pexels.com/photos/1556707/pexels-photo-1556707.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "eggs",
    origin: "Free range",
    variants: [
      { variantId: "6", label: "Tray of 6", price: 48, stockCount: 40 },
      { variantId: "12", label: "Tray of 12", price: 92, stockCount: 26 },
      { variantId: "30", label: "Tray of 30", price: 215, stockCount: 6 },
    ],
  },
];

const GROCERY = [
  {
    productId: "grocery-joha-rice",
    name: "Joha rice",
    image: "https://images.pexels.com/photos/5167396/pexels-photo-5167396.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "rice-atta-dal",
    pack: "5 kg bag",
    price: 540,
    stockCount: 18,
  },
  {
    productId: "grocery-atta",
    name: "Whole wheat atta",
    image: "https://images.pexels.com/photos/4964102/pexels-photo-4964102.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "rice-atta-dal",
    pack: "5 kg bag",
    price: 265,
    stockCount: 23,
  },
  {
    productId: "grocery-masoor-dal",
    name: "Masoor dal",
    image: "https://images.pexels.com/photos/8108209/pexels-photo-8108209.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "rice-atta-dal",
    pack: "1 kg pouch",
    price: 128,
    stockCount: 35,
  },
  {
    productId: "grocery-mustard-oil",
    name: "Kachi ghani mustard oil",
    image: "https://images.pexels.com/photos/12284682/pexels-photo-12284682.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "oil-ghee-spices",
    pack: "1 L bottle",
    price: 182,
    stockCount: 9,
  },
  {
    productId: "grocery-assam-tea",
    name: "Assam CTC tea",
    image: "https://images.pexels.com/photos/17751258/pexels-photo-17751258.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "assam-tea-beverages",
    pack: "500 g pack",
    price: 240,
    stockCount: 41,
  },
  {
    productId: "grocery-milk",
    name: "Toned milk",
    image: "https://images.pexels.com/photos/17748230/pexels-photo-17748230.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "dairy-bakery",
    pack: "500 ml pouch",
    price: 29,
    stockCount: 4,
  },
  {
    productId: "grocery-biscuits",
    name: "Marie biscuits",
    image: "https://images.pexels.com/photos/31909870/pexels-photo-31909870.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "snacks-packaged-food",
    pack: "300 g pack",
    price: 45,
    stockCount: 52,
  },
  {
    productId: "grocery-detergent",
    name: "Detergent powder",
    image: "https://images.pexels.com/photos/21582448/pexels-photo-21582448.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "cleaning-household",
    pack: "1 kg pack",
    price: 115,
    stockCount: 0,
  },
];

/**
 * Over-the-counter medicine only.
 *
 * Nothing here is flagged requiresPrescription: anything needing a script
 * goes through the prescription upload so a pharmacist sees it first, and is
 * never seeded as directly buyable stock.
 */
const MEDICINE = [
  {
    productId: "otc-paracetamol",
    name: "Paracetamol 500 mg",
    image: "https://images.pexels.com/photos/12585202/pexels-photo-12585202.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "over-the-counter",
    pack: "Strip of 15 tablets",
    price: 32,
    stockCount: 64,
    useFor: "Fever and body pain",
  },
  {
    productId: "otc-ors",
    name: "ORS electrolyte powder",
    image: "https://images.pexels.com/photos/3923161/pexels-photo-3923161.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "over-the-counter",
    pack: "Box of 5 sachets",
    price: 95,
    stockCount: 38,
    useFor: "Rehydration after fever or loose motion",
  },
  {
    productId: "otc-antacid",
    name: "Antacid gel (mint)",
    image: "https://images.pexels.com/photos/7722638/pexels-photo-7722638.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "over-the-counter",
    pack: "170 ml bottle",
    price: 148,
    stockCount: 21,
    useFor: "Acidity and heartburn",
  },
  {
    productId: "otc-cetirizine",
    name: "Cetirizine 10 mg",
    image: "https://images.pexels.com/photos/5995030/pexels-photo-5995030.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "over-the-counter",
    pack: "Strip of 10 tablets",
    price: 28,
    stockCount: 5,
    useFor: "Allergy, sneezing and rash",
  },
  {
    productId: "otc-antiseptic",
    name: "Antiseptic liquid",
    image: "https://images.pexels.com/photos/4072041/pexels-photo-4072041.jpeg?auto=compress&cs=tinysrgb&w=800",
    subCategory: "over-the-counter",
    pack: "200 ml bottle",
    price: 132,
    stockCount: 0,
    useFor: "Cuts, wounds and first aid",
  },
];

const RESTAURANTS = [
  {
    restaurantId: "rest-jonaki",
    name: "Jonaki Bhojonaloy",
    image: "https://images.pexels.com/photos/36885716/pexels-photo-36885716.jpeg?auto=compress&cs=tinysrgb&w=800",
    cuisine: "Assamese thali · Home-style",
    rating: 4.6,
    ratingCount: 412,
    prepMinutes: 30,
    priceForTwo: 320,
    isOpen: true,
    signatureDishes: ["Masor tenga", "Khar", "Aloo pitika"],
  },
  {
    restaurantId: "rest-pitha-ghor",
    name: "Pitha Ghor",
    image: "https://images.pexels.com/photos/7378470/pexels-photo-7378470.jpeg?auto=compress&cs=tinysrgb&w=800",
    cuisine: "Pitha · Sweets",
    rating: 4.8,
    ratingCount: 286,
    prepMinutes: 25,
    priceForTwo: 180,
    isOpen: true,
    signatureDishes: ["Til pitha", "Narikol laru", "Ghila pitha"],
  },
  {
    restaurantId: "rest-refinery-tiffin",
    name: "Refinery Tiffin Room",
    image: "https://images.pexels.com/photos/38834853/pexels-photo-38834853.jpeg?auto=compress&cs=tinysrgb&w=800",
    cuisine: "Tiffin · North Indian",
    rating: 4.3,
    ratingCount: 158,
    prepMinutes: 20,
    priceForTwo: 220,
    isOpen: true,
    signatureDishes: ["Puri sabji", "Paratha thali", "Masala chai"],
  },
  {
    restaurantId: "rest-hill-side",
    name: "Hill Side Dhaba",
    image: "https://images.pexels.com/photos/18803174/pexels-photo-18803174.jpeg?auto=compress&cs=tinysrgb&w=800",
    cuisine: "Street food · Snacks",
    rating: 4.1,
    ratingCount: 97,
    prepMinutes: 35,
    priceForTwo: 260,
    isOpen: false,
    signatureDishes: ["Chowmein", "Momo", "Egg roll"],
  },
  {
    restaurantId: "rest-green-bowl",
    name: "Green Bowl Kitchen",
    image: "https://images.pexels.com/photos/32810338/pexels-photo-32810338.jpeg?auto=compress&cs=tinysrgb&w=800",
    cuisine: "Healthy bowls · Salads",
    rating: 4.5,
    ratingCount: 64,
    prepMinutes: 25,
    priceForTwo: 380,
    isOpen: true,
    signatureDishes: ["Quinoa bowl", "Grilled paneer bowl", "Fruit bowl"],
  },
];

export interface CatalogSeedResult {
  products: { created: number; existing: number };
  restaurants: { created: number; existing: number };
}

/**
 * Inserts any missing catalogue rows.
 *
 * Idempotent and non-destructive: a row that already exists is left alone,
 * so re-seeding never overwrites a stock count someone has since corrected.
 * Rows go in through `new` + `save()` rather than insertMany so the model's
 * pre-validate hooks actually run — a bulk insert would skip the
 * variants-or-price and Rx-aisle checks.
 */
export const seedCatalog = async (): Promise<CatalogSeedResult> => {
  const productRows = [
    ...FRESH.map((p) => ({ ...p, category: CATEGORY_SLUGS.FRESH })),
    ...GROCERY.map((p) => ({ ...p, category: CATEGORY_SLUGS.GROCERY })),
    ...MEDICINE.map((p) => ({ ...p, category: CATEGORY_SLUGS.MEDICINE })),
  ];

  let productsCreated = 0;
  let productsExisting = 0;

  for (const row of productRows) {
    if (await Product.findOne({ productId: row.productId })) {
      productsExisting++;
      continue;
    }
    await new Product(row).save();
    productsCreated++;
  }

  let restaurantsCreated = 0;
  let restaurantsExisting = 0;

  for (const row of RESTAURANTS) {
    if (await Restaurant.findOne({ restaurantId: row.restaurantId })) {
      restaurantsExisting++;
      continue;
    }
    await new Restaurant(row).save();
    restaurantsCreated++;
  }

  logger.info(
    `Catalogue seed: ${productsCreated} product(s) and ` +
      `${restaurantsCreated} restaurant(s) created`,
  );

  return {
    products: { created: productsCreated, existing: productsExisting },
    restaurants: { created: restaurantsCreated, existing: restaurantsExisting },
  };
};

/**
 * @desc    Seed the demo catalogue
 * @route   POST /api/catalog/seed
 * @access  Disabled unless ALLOW_CATALOG_SEED=true
 */
export const seedCatalogData = asyncHandler(
  async (_req: Request, res: Response) => {
    // Writes to the live catalogue, so it stays shut unless a deployment
    // opts in. 404 rather than 403 — a 403 confirms the route is there.
    if (process.env.ALLOW_CATALOG_SEED !== "true") {
      res.status(404).json({
        success: false,
        message: "Not Found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    const result = await seedCatalog();
    const created = result.products.created + result.restaurants.created;

    res.status(created > 0 ? 201 : 200).json({
      success: true,
      message:
        created > 0
          ? `Seeded ${result.products.created} product(s) and ${result.restaurants.created} restaurant(s)`
          : "Catalogue already seeded",
      data: result,
    });
  },
);

export default seedCatalogData;
