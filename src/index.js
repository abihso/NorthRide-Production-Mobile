import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import { configDotenv } from "dotenv";
import express from "express";
import session from "express-session";
import http from "http"; // <-- Required to wrap Express in an HTTP server
import passport from "passport";
import { Server } from "socket.io"; // <-- Import Socket.io
import db from "./db/index.js";
import { requireAuth } from "./middlewares/auth.js";
import authRoute from "./routes/authroute.js";
import configRoute from "./routes/configRoute.js";
import deliveryRouter from "./routes/delivery.js";
import notificationrouter from "./routes/notificationRoute.js";
import orderroute from "./routes/orderRoute.js";
import pricerouter from "./routes/pricingRoute.js";
import productroute from "./routes/productRoute.js";
import promotionrouter from "./routes/promotionRoute.js";
import ridesbookroute from "./routes/rideBookingsRoutes.js";
import ridersearningsrouter from "./routes/ridersEarningsRoutes.js";
import riderRoute from "./routes/ridersRoute.js";
import shoproute from "./routes/shopRoute.js";
import sysrouter from "./routes/systemConfigRoute.js";
import ticketrouter from "./routes/ticketRoute.js";
import userRoute from "./routes/usersRoute.js";

configDotenv();

const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;
const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGINS || "http://localhost:8081")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET must be configured in production.");
}

const corsOrigin = (origin, callback) => {
  if (!origin || allowedOrigins.has(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error("Origin is not allowed by CORS."));
};

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});

app.set("io", io);

const PgStore = connectPgSimple(session);

app.set("trust proxy", 1);

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      schemaName: "public",
      createTableIfMissing: true,
      pruneSessionInterval: false,
    }),
    secret: sessionSecret || "development-only-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  req.db = db;
  next();
});

// =============================================
// SOCKET.IO CONNECTION MANAGEMENT
// =============================================
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // When a rider app connects, it joins a secure room matching its riderId
  socket.on("join_rider_room", (riderId) => {
    socket.join(`rider_${riderId}`);
    console.log(`Rider joined room: rider_${riderId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

app.get("/abihsolo", (r, res) => {
  return res.sendStatus(200);
});

app.use("/api", userRoute);
app.use("/api", riderRoute);
app.use("/api", shoproute);
app.use("/api", authRoute);
app.use("/api", productroute);
app.use("/api", requireAuth, ridesbookroute);
app.use("/api", requireAuth, orderroute);
app.use("/api", requireAuth, ridersearningsrouter);
app.use("/api", requireAuth, notificationrouter);
app.use("/api", requireAuth, ticketrouter);
app.use("/api", pricerouter);
app.use("/api", promotionrouter);
app.use("/api", sysrouter);
app.use("/api", requireAuth, deliveryRouter);
app.use("/api", requireAuth, configRoute);

app.get("/", async (req, res) => {
  return res.status(200).json({
    sessionData: req.session,
  });
});

const PORT = process.env.PORT || 5000;
// Note: Use `server.listen` instead of `app.listen` so WebSockets share the same port
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} http://localhost:${PORT}`);
});
