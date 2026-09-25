import { asc, eq } from "drizzle-orm";
import db from "./index.js";
import { promotions, shops, users } from "./schema.js";

const shopSeeds = [
  {
    shopName: "Tamale Fresh Market",
    shopDescription:
      "Fresh groceries, pantry staples, and household essentials.",
    shopCategory: "groceries",
    address: "Market Road",
    city: "Tamale",
    state: "Northern Region",
    country: "Ghana",
    latitude: "9.4075",
    longitude: "-0.8533",
    rating: "4.60",
  },
  {
    shopName: "Savanna Kitchen",
    shopDescription: "Local Ghanaian meals prepared fresh for delivery.",
    shopCategory: "food",
    address: "Hospital Road",
    city: "Tamale",
    state: "Northern Region",
    country: "Ghana",
    latitude: "9.4000",
    longitude: "-0.8420",
    rating: "4.80",
  },
  {
    shopName: "Northside Essentials",
    shopDescription: "Everyday essentials and quick household purchases.",
    shopCategory: "general",
    address: "Vittin Road",
    city: "Tamale",
    state: "Northern Region",
    country: "Ghana",
    latitude: "9.4250",
    longitude: "-0.8650",
    rating: "4.40",
  },
];

const seedPromotions = (shopIds, startDate, endDate) => [
  {
    shopId: shopIds[0],
    promoCode: "FRESH10",
    title: "Fresh market savings",
    description: "Save 10% on groceries from Tamale Fresh Market.",
    discountType: "percentage",
    discountValue: "10.00",
    minimumOrderAmount: "50.00",
    maximumDiscount: "25.00",
    applicableTo: "delivery",
    startDate,
    endDate,
    usageLimit: 500,
    isActive: true,
  },
  {
    shopId: shopIds[1],
    promoCode: "SAVANNA20",
    title: "Savanna Kitchen special",
    description: "Get GHS 20 off a qualifying meal order.",
    discountType: "fixed",
    discountValue: "20.00",
    minimumOrderAmount: "100.00",
    applicableTo: "delivery",
    startDate,
    endDate,
    usageLimit: 300,
    isActive: true,
  },
  {
    shopId: shopIds[2],
    promoCode: "NORTHRIDE15",
    title: "Northside essentials offer",
    description: "Save 15% on everyday essentials.",
    discountType: "percentage",
    discountValue: "15.00",
    minimumOrderAmount: "75.00",
    maximumDiscount: "30.00",
    applicableTo: "both",
    startDate,
    endDate,
    usageLimit: 400,
    isActive: true,
  },
  {
    shopId: shopIds[0],
    promoCode: "MARKET25",
    title: "Market basket deal",
    description: "Get GHS 25 off a large grocery basket.",
    discountType: "fixed",
    discountValue: "25.00",
    minimumOrderAmount: "150.00",
    applicableTo: "delivery",
    startDate,
    endDate,
    usageLimit: 250,
    isActive: true,
  },
  {
    shopId: shopIds[1],
    promoCode: "LUNCH15",
    title: "Lunch delivery offer",
    description: "Save 15% on your next Savanna Kitchen order.",
    discountType: "percentage",
    discountValue: "15.00",
    minimumOrderAmount: "60.00",
    maximumDiscount: "20.00",
    applicableTo: "delivery",
    startDate,
    endDate,
    usageLimit: 350,
    isActive: true,
  },
  {
    shopId: shopIds[2],
    promoCode: "ESSENTIALS10",
    title: "Everyday essentials discount",
    description: "Save 10% on everyday household essentials.",
    discountType: "percentage",
    discountValue: "10.00",
    minimumOrderAmount: "40.00",
    maximumDiscount: "15.00",
    applicableTo: "both",
    startDate,
    endDate,
    usageLimit: 500,
    isActive: true,
  },
];

const seed = async () => {
  const [owner] = await db
    .select({ userId: users.userId })
    .from(users)
    .orderBy(asc(users.userId))
    .limit(1);

  if (!owner) {
    throw new Error("Create at least one user before seeding shops.");
  }

  const shopIds = [];
  for (const shopSeed of shopSeeds) {
    const [existingShop] = await db
      .select({ shopId: shops.shopId })
      .from(shops)
      .where(eq(shops.shopName, shopSeed.shopName))
      .limit(1);

    if (existingShop) {
      shopIds.push(existingShop.shopId);
      continue;
    }

    const [shop] = await db
      .insert(shops)
      .values({
        ...shopSeed,
        ownerId: owner.userId,
        isOpen: true,
        isVerified: true,
      })
      .returning({ shopId: shops.shopId });

    shopIds.push(shop.shopId);
  }

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 30);

  for (const promotion of seedPromotions(shopIds, startDate, endDate)) {
    await db
      .insert(promotions)
      .values(promotion)
      .onConflictDoNothing({ target: promotions.promoCode });
  }

  console.log(
    `Seeded ${shopIds.length} shops and ${seedPromotions(shopIds, startDate, endDate).length} promotions.`,
  );
};

seed().catch((error) => {
  console.error("Failed to seed shops and promotions:", error);
  process.exitCode = 1;
});
