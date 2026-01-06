import path from "path";

export const USER_DATA_DIR = "./user_data";

export const HEADLESS =
  process.env.HEADLESS === "true" ||
  process.env.NODE_ENV === "production" ||
  process.env.RAILWAY_ENVIRONMENT !== undefined;
export const X_PASSCODE = process.env.X_PASSCODE || "";

export const AUTO_LOGIN = process.env.AUTO_LOGIN === "true";
export const X_USERNAME = process.env.X_USERNAME || "";
export const X_PASSWORD = process.env.X_PASSWORD || "";

export const MESSAGES_CONFIG_PATH = path.join(process.cwd(), "messages.json");
export const GIFS_DIR = path.join(process.cwd(), "gifs");

export const CHAT_LIST_URL = "https://x.com/i/chat";
