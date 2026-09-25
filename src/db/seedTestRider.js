import { eq } from "drizzle-orm";
import hashpassword from "../utils/hashpassword.js";
import db from "./index.js";
import { riders, users } from "./schema.js";

const testRider = {
  email: "abihsolo@gmail.com",
  password: "abihsolo",
  fullName: "Abihsolo Test Rider",
  phoneNumber: "+233555747931",
};

const seedTestRider = async () => {
  await db.transaction(async (tx) => {
    const passwordHash = hashpassword(testRider.password);
    const [existingUser] = await tx
      .select()
      .from(users)
      .where(eq(users.email, testRider.email))
      .limit(1);

    let user;
    if (existingUser) {
      [user] = await tx
        .update(users)
        .set({
          fullName: testRider.fullName,
          phoneNumber: testRider.phoneNumber,
          passwordHash,
          userType: "rider",
          isVerified: true,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.userId, existingUser.userId))
        .returning();
    } else {
      [user] = await tx
        .insert(users)
        .values({
          email: testRider.email,
          fullName: testRider.fullName,
          phoneNumber: testRider.phoneNumber,
          passwordHash,
          userType: "rider",
          isVerified: true,
          isActive: true,
        })
        .returning();
    }

    const [existingRider] = await tx
      .select()
      .from(riders)
      .where(eq(riders.userId, user.userId))
      .limit(1);

    if (existingRider) {
      await tx
        .update(riders)
        .set({
          vehicleType: "motorcycle",
          vehiclePlateNumber: "NR-TEST-01",
          vehicleModel: "Test Motorcycle",
          vehicleColor: "Black",
          isAvailable: true,
          isApproved: true,
          currentLatitude: "9.4075",
          currentLongitude: "-0.8533",
          rating: "5.00",
          updatedAt: new Date(),
        })
        .where(eq(riders.riderId, existingRider.riderId));
    } else {
      await tx.insert(riders).values({
        userId: user.userId,
        vehicleType: "motorcycle",
        vehiclePlateNumber: "NR-TEST-01",
        vehicleModel: "Test Motorcycle",
        vehicleColor: "Black",
        isAvailable: true,
        isApproved: true,
        currentLatitude: "9.4075",
        currentLongitude: "-0.8533",
        rating: "5.00",
      });
    }
  });

  console.log(`Test rider ready: ${testRider.email}`);
};

seedTestRider().catch((error) => {
  console.error("Failed to seed test rider:", error);
  process.exitCode = 1;
});
