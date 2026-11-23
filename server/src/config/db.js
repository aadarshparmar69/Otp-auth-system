const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

let mongoServer = null;

const connectDB = async () => {
  try {
    let uri = process.env.MONGO_URI;

    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
      console.log(`MongoDB connected: ${mongoose.connection.host}`);
      return;
    } catch (err) {
      console.log("External MongoDB not available, starting local file-stored database...");
    }

    const localDbPath = path.join(__dirname, "../../data/db");
    if (!fs.existsSync(localDbPath)) {
      fs.mkdirSync(localDbPath, { recursive: true });
    }

    const { MongoMemoryServer } = require("mongodb-memory-server");
    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbPath: localDbPath,
        storageEngine: "wiredTiger",
        dbName: "otp_auth",
      },
    });
    uri = mongoServer.getUri();

    await mongoose.connect(uri);
    console.log(`MongoDB running with local storage at: ${localDbPath}`);
    console.log(`MongoDB connection URI: ${uri}`);
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
  }
};

process.on("SIGINT", async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop({ doCleanup: false, force: false });
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop({ doCleanup: false, force: false });
  process.exit(0);
});

module.exports = connectDB;
