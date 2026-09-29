import express, { Application, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/dbConnection";
import rateLimit from "express-rate-limit";
import corsOptions from "./config/corOptions";
import { errorHandler, routeNotFound } from "./middleware/errorMiddleware";

//Routes
import auth from "./routes/Admin/auth";

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
app.use("/api/auth", apiLimiter, auth);

// 404 handler
app.use(routeNotFound);

// Custom error handler
app.use(errorHandler);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
});

export default app;
