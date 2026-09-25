import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";
import {
  requireBodyOwnership,
  requireParamOwnership,
  requireRiderOwnership,
} from "../middlewares/auth.js";
import calculateDistance from "../utils/cal.js";
const riderRoute = Router();

riderRoute.get(
  "/riders/:riderId/jobs",
  requireRiderOwnership(),
  async (req, res) => {
    try {
      const riderId = parseInt(req.params.riderId);
      const [rider] = await db
        .select({
          isAvailable: schema.riders.isAvailable,
          isApproved: schema.riders.isApproved,
        })
        .from(schema.riders)
        .where(eq(schema.riders.riderId, riderId))
        .limit(1);

      if (!rider?.isAvailable || !rider.isApproved) {
        return res.json({ success: true, data: [] });
      }

      const [rides, deliveries] = await Promise.all([
        db
          .select()
          .from(schema.rideBookings)
          .where(
            and(
              or(
                eq(schema.rideBookings.riderId, riderId),
                and(
                  isNull(schema.rideBookings.riderId),
                  inArray(schema.rideBookings.status, ["pending", "searching"]),
                ),
              ),
              inArray(schema.rideBookings.status, [
                "pending",
                "searching",
                "confirmed",
              ]),
            ),
          ),
        db
          .select()
          .from(schema.deliveries)
          .where(
            and(
              or(
                eq(schema.deliveries.riderId, riderId),
                and(
                  isNull(schema.deliveries.riderId),
                  inArray(schema.deliveries.status, ["pending", "searching"]),
                ),
              ),
              inArray(schema.deliveries.status, [
                "pending",
                "searching",
                "accepted",
              ]),
            ),
          ),
      ]);

      res.json({
        success: true,
        data: [
          ...rides.map((ride) => ({ ...ride, jobType: "ride" })),
          ...deliveries.map((delivery) => ({
            ...delivery,
            jobType: "delivery",
          })),
        ],
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
);

riderRoute.post(
  "/riders/:riderId/jobs/:jobType/:jobId/respond",
  requireRiderOwnership(),
  async (req, res) => {
    try {
      const riderId = parseInt(req.params.riderId);
      const jobId = parseInt(req.params.jobId);
      const { response } = req.body;

      if (!["accept", "decline"].includes(response)) {
        return res.status(400).json({
          success: false,
          message: "Response must be accept or decline",
        });
      }

      if (req.params.jobType === "delivery") {
        if (response === "decline") {
          await db.insert(schema.riderRejections).values({
            deliveryId: jobId,
            riderId,
            reason: "Declined by rider",
          });
          return res.json({ success: true, message: "Delivery declined" });
        }

        const [delivery] = await db
          .update(schema.deliveries)
          .set({ riderId, status: "accepted", updatedAt: new Date() })
          .where(
            and(
              eq(schema.deliveries.deliveryId, jobId),
              or(
                isNull(schema.deliveries.riderId),
                eq(schema.deliveries.riderId, riderId),
              ),
            ),
          )
          .returning();

        return res.json({ success: true, data: delivery });
      }

      if (req.params.jobType === "ride") {
        const [ride] = await db
          .update(schema.rideBookings)
          .set({
            riderId,
            status: response === "accept" ? "confirmed" : "rejected",
            confirmedAt: response === "accept" ? new Date() : undefined,
          })
          .where(
            and(
              eq(schema.rideBookings.rideId, jobId),
              or(
                isNull(schema.rideBookings.riderId),
                eq(schema.rideBookings.riderId, riderId),
              ),
            ),
          )
          .returning();

        return res.json({ success: true, data: ride });
      }

      return res.status(400).json({
        success: false,
        message: "Unsupported job type",
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
);

riderRoute.patch(
  "/riders/:riderId/jobs/:jobType/:jobId/status",
  requireRiderOwnership(),
  async (req, res) => {
    try {
      const riderId = parseInt(req.params.riderId);
      const jobId = parseInt(req.params.jobId);
      const { status } = req.body;

      const allowedStatuses =
        req.params.jobType === "ride"
          ? ["arrived", "in_progress", "completed", "cancelled"]
          : ["picked_up", "in_transit", "delivered", "cancelled"];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status transition",
        });
      }

      const table =
        req.params.jobType === "ride" ? schema.rideBookings : schema.deliveries;
      const idColumn =
        req.params.jobType === "ride"
          ? schema.rideBookings.rideId
          : schema.deliveries.deliveryId;
      const riderColumn =
        req.params.jobType === "ride"
          ? schema.rideBookings.riderId
          : schema.deliveries.riderId;
      const updateData = { status, updatedAt: new Date() };

      if (req.params.jobType === "ride") {
        if (status === "arrived") updateData.riderArrivedAt = new Date();
        if (status === "in_progress") updateData.rideStartedAt = new Date();
        if (status === "completed") updateData.rideCompletedAt = new Date();
        if (status === "cancelled") updateData.cancelledAt = new Date();
      } else {
        if (status === "picked_up") updateData.pickedUpAt = new Date();
        if (status === "delivered") {
          updateData.deliveredAt = new Date();
          updateData.paymentStatus = "paid";
        }
      }

      const [job] = await db
        .update(table)
        .set(updateData)
        .where(and(eq(idColumn, jobId), eq(riderColumn, riderId)))
        .returning();

      if (!job) {
        return res.status(404).json({
          success: false,
          message: "Assigned job not found",
        });
      }

      res.json({ success: true, data: job });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
);

riderRoute.get(
  "/users/:userId/rider",
  requireParamOwnership("userId"),
  async (req, res) => {
    try {
      const [rider] = await db
        .select()
        .from(schema.riders)
        .where(eq(schema.riders.userId, parseInt(req.params.userId)))
        .limit(1);

      if (!rider) {
        return res
          .status(404)
          .json({ success: false, message: "Rider profile not found" });
      }

      res.json({ success: true, data: rider });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
);

// =============================================
// RIDER ROUTES
// =============================================

// Get all riders
riderRoute.get("/riders", async (req, res) => {
  try {
    const { isAvailable, isApproved, limit = 100 } = req.query;
    let query = db.select().from(schema.riders);

    if (isAvailable !== undefined) {
      query = query.where(
        eq(schema.riders.isAvailable, isAvailable === "true"),
      );
    }
    if (isApproved !== undefined) {
      query = query.where(eq(schema.riders.isApproved, isApproved === "true"));
    }

    const riders = await query.limit(parseInt(limit));
    res.json({ success: true, data: riders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get rider by ID
riderRoute.get("/riders/:id", async (req, res) => {
  try {
    const [rider] = await db
      .select()
      .from(schema.riders)
      .where(eq(schema.riders.riderId, parseInt(req.params.id)));

    if (!rider) {
      return res
        .status(404)
        .json({ success: false, message: "Rider not found" });
    }
    res.json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create rider
riderRoute.post("/riders", requireBodyOwnership("userId"), async (req, res) => {
  try {
    const {
      userId,
      vehicleType,
      vehiclePlateNumber,
      vehicleModel,
      vehicleColor,
      licenseNumber,
      isAvailable,
      isApproved,
      currentLatitude,
      currentLongitude,
      maxPassengers,
      hasAirConditioning,
      hasWifi,
      bankAccountName,
      bankAccountNumber,
      bankName,
    } = req.body;

    const [rider] = await db
      .insert(schema.riders)
      .values({
        userId,
        vehicleType,
        vehiclePlateNumber,
        vehicleModel,
        vehicleColor,
        licenseNumber,
        isAvailable: isAvailable || true,
        isApproved: isApproved || false,
        currentLatitude,
        currentLongitude,
        maxPassengers: maxPassengers || 1,
        hasAirConditioning: hasAirConditioning || false,
        hasWifi: hasWifi || false,
        bankAccountName,
        bankAccountNumber,
        bankName,
      })
      .returning();

    res.status(201).json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update rider availability
riderRoute.patch(
  "/riders/:id/availability",
  requireRiderOwnership("id"),
  async (req, res) => {
    try {
      const { isAvailable, latitude, longitude } = req.body;

      const updateData = { isAvailable };
      if (latitude !== undefined) updateData.currentLatitude = latitude;
      if (longitude !== undefined) updateData.currentLongitude = longitude;

      const [rider] = await db
        .update(schema.riders)
        .set(updateData)
        .where(eq(schema.riders.riderId, parseInt(req.params.id)))
        .returning();

      if (!rider) {
        return res
          .status(404)
          .json({ success: false, message: "Rider not found" });
      }
      res.json({ success: true, data: rider });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
);

// Find nearby riders
riderRoute.get("/riders/nearby", async (req, res) => {
  try {
    const { latitude, longitude, radius = 5, rideType } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radiusKm = parseFloat(radius);

    let query = db
      .select()
      .from(schema.riders)
      .where(
        and(
          eq(schema.riders.isAvailable, true),
          eq(schema.riders.isApproved, true),
          sql`${schema.riders.currentLatitude} IS NOT NULL`,
          sql`${schema.riders.currentLongitude} IS NOT NULL`,
        ),
      );

    if (rideType) {
      query = query.where(eq(schema.riders.vehicleType, rideType));
    }

    const riders = await query;

    // Calculate distance using Haversine formula
    const nearbyRiders = riders
      .map((rider) => {
        const distance = calculateDistance(
          lat,
          lng,
          parseFloat(rider.currentLatitude),
          parseFloat(rider.currentLongitude),
        );
        return { ...rider, distance };
      })
      .filter((rider) => rider.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);

    res.json({ success: true, data: nearbyRiders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default riderRoute;
