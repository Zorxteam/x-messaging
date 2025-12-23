import path from "path";

export const USER_DATA_DIR = "./user_data";

// Auto-detect headless mode: true in production/Railway, or when explicitly set
export const HEADLESS =
  process.env.HEADLESS === "true" ||
  process.env.NODE_ENV === "production" ||
  process.env.RAILWAY_ENVIRONMENT !== undefined;
export const X_PASSCODE = process.env.X_PASSCODE || "";

// Auto-login configuration. Use environment variables to enable and provide credentials.
export const AUTO_LOGIN = process.env.AUTO_LOGIN === "true";
export const X_USERNAME = process.env.X_USERNAME || "";
export const X_PASSWORD = process.env.X_PASSWORD || "";

export const MESSAGES_CONFIG_PATH = path.resolve("./messages.json");
export const GIFS_DIR = path.resolve("./gifs");

export const CHAT_LIST_URL = "https://x.com/i/chat";
