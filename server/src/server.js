require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});

setImmediate(() => {
  const connectDB = require("./config/db");
  connectDB().catch((err) => {
    console.error("Database connection error:", err.message);
  });
});
