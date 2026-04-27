import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

function resolveDatabasePath(input) {
  if (!input) {
    return path.join(process.cwd(), "data", "chess-master.db");
  }

  return input.startsWith("file:") ? input.slice("file:".length) : input;
}

const port = Number(process.env.PORT || 4000);
const databasePath = resolveDatabasePath(process.env.DATABASE_URL);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port,
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  serverUrl: process.env.SERVER_URL || `http://localhost:${port}`,
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  databasePath,
  emailUser: process.env.EMAIL_USER || "",
  emailPass: process.env.EMAIL_PASS || "",
  emailHost: process.env.EMAIL_HOST || "",
  emailPort: Number(process.env.EMAIL_PORT || 465),
  emailSecure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === "true" : true,
};

export const flags = {
  googleEnabled: Boolean(config.googleClientId && config.googleClientSecret),
  emailEnabled: Boolean(
    (config.emailHost && config.emailUser && config.emailPass) ||
      (!config.emailHost && config.emailUser && config.emailPass),
  ),
};
