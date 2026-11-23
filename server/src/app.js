const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5001",
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(mongoSanitize());

app.use(express.static(path.join(__dirname, "../../client")));

app.get("/health", (req, res) => res.status(200).json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/v1/auth", (req, res, next) => {
  const authRoutes = require("./routes/auth.routes");
  return authRoutes(req, res, next);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../client/index.html"));
});

app.use(errorHandler);

module.exports = app;
