import express, { Application, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/dbConnection";
import rateLimit from "express-rate-limit";
import corsOptions from "./config/corOptions";
import initFirebaseAdmin from "./config/firebaseAdmin";
import { errorHandler, routeNotFound } from "./middleware/errorMiddleware";

//Routes
import auth from "./routes/Admin/auth";
import customerRoutes from "./routes/Customer/auth";
import merchantRoutes from "./routes/Merchant";
import driverRoutes from "./routes/Driver";
import seedAdminHandler from "./aPrivilege/seeder";
import seedCatalogData from "./aPrivilege/catalogSeeder";
import productRoutes from "./routes/Catalog/products";
import restaurantRoutes from "./routes/Catalog/restaurants";
import orderRoutes from "./routes/Order/orders";
import notificationRoutes from "./routes/notifications";

// Create Express application
const app: Application = express();
const PORT = process.env.PORT || 8080;

//CORS
app.use(cors(corsOptions));

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting (only applied to auth routes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes",
});

// Health check endpoints (no rate limiting)
app.get("/", (_req: Request, res: Response) => {
  res.status(200).type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Local Mart  API</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #10131a; color: #eef2ff; font: 16px system-ui, sans-serif; }
      main { max-width: 36rem; padding: 2rem; }
      h1 { margin-bottom: .5rem; }
      p { color: #aeb8cc; line-height: 1.6; }
      a { color: #72e4c2; }
      code { color: #d7def0; }
    </style>
  </head>
  <body>
    <main>
      <h1>Local Mart  API</h1>
      <p>The API service is running. Use the application to access Local Mart, or check the service status below.</p>
      <p><a href="/health">Health</a> · <a href="/ready">Readiness</a></p>
      <p>API routes are available under <code>/api</code>.</p>
    </main>
  </body>
</html>`);
});
app.get("/_ah/health", (req: Request, res: Response) => {
  res.status(200).send("OK");
});

app.get("/_ah/start", (req: Request, res: Response) => {
  res.status(200).send("OK");
});

// Admin & Auth (rate limiting only on auth)
app.use("/api/admin/auth", apiLimiter, auth);

// Seeding mints privileged accounts, so it is rate limited like a login and
// stays disabled unless ALLOW_ADMIN_SEED=true (enforced in the handler).
app.post("/api/admin/seed", apiLimiter, seedAdminHandler);

// Actors. Auth-bearing routes are rate limited on the same budget as login.
app.use("/api/customers", apiLimiter, customerRoutes);
app.use("/api/merchants", apiLimiter, merchantRoutes);
app.use("/api/drivers", apiLimiter, driverRoutes);

// Catalogue. Reads are public and un-rate-limited: browsing the aisles is
// the busiest thing the app does, and a shopper paging through products
// must not be throttled on the login budget.
app.use("/api/products", productRoutes);
app.use("/api/restaurants", restaurantRoutes);

// Orders carry a bearer token on every call, same budget as the actor routes.
app.use("/api/orders", apiLimiter, orderRoutes);

// Device-token registration for order alerts (Admin / Merchant).
app.use("/api/notifications", apiLimiter, notificationRoutes);

// Seeding writes to the live catalogue, so it is rate limited and stays
// disabled unless ALLOW_CATALOG_SEED=true (enforced in the handler).
app.post("/api/catalog/seed", apiLimiter, seedCatalogData);

// 404 handler
app.use(routeNotFound);

// Custom error handler
app.use(errorHandler);

// Firebase Admin (non-fatal: logs and continues if credentials are missing)
initFirebaseAdmin();

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
});

export default app;
// Note: The server.ts file is the entry point for the backend application. It sets up the Express server, configures middleware, defines routes, and starts listening on the specified port. The code includes health check endpoints, rate limiting for authentication routes, and error handling middleware.
