// Origins are matched exactly against the browser's Origin header, which never
// has a trailing slash or path.
const allowOrigins = [
  "http://localhost:5173",
  "https://localmart.live",
  "https://www.localmart.live",
];

// Add environment-specific origins (comma-separated allowed)
if (process.env.NODE_ENV === "production" && process.env.FRONTEND_URL) {
  for (const url of process.env.FRONTEND_URL.split(",")) {
    const origin = url.trim().replace(/\/+$/, "");
    if (origin && !allowOrigins.includes(origin)) allowOrigins.push(origin);
  }
}

export default allowOrigins;
