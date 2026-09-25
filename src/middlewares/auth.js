import { eq } from "drizzle-orm";
import db from "../db/index.js";
import { riders } from "../db/schema.js";

const isAuthenticated = (req) =>
  typeof req.isAuthenticated === "function" &&
  req.isAuthenticated() &&
  Boolean(req.user);

export const requireAuth = (req, res, next) => {
  if (isAuthenticated(req)) {
    next();
    return;
  }

  res.status(401).json({
    success: false,
    message: "Authentication required",
  });
};

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!isAuthenticated(req)) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!roles.includes(req.user.userType)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
      return;
    }

    next();
  };

export const requireParamOwnership = (paramName) => (req, res, next) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const requestedUserId = Number(req.params[paramName]);

  if (req.user.userType === "admin" || req.user.userId === requestedUserId) {
    next();
    return;
  }

  res.status(403).json({
    success: false,
    message: "You do not have permission to access this resource",
  });
};

export const requireBodyOwnership = (fieldName) => (req, res, next) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const requestedUserId = Number(req.body[fieldName]);

  if (req.user.userType === "admin" || req.user.userId === requestedUserId) {
    next();
    return;
  }

  res.status(403).json({
    success: false,
    message: "You do not have permission to perform this action",
  });
};

export const requireRiderOwnership =
  (paramName = "riderId") =>
  async (req, res, next) => {
    if (!isAuthenticated(req)) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (req.user.userType === "admin") {
      next();
      return;
    }

    const riderId = Number(req.params[paramName]);
    const [rider] = await db
      .select({ userId: riders.userId })
      .from(riders)
      .where(eq(riders.riderId, riderId))
      .limit(1);

    if (!rider || rider.userId !== req.user.userId) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to access this rider resource",
      });
      return;
    }

    next();
  };
