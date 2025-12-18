import path from "path";

export const USER_DATA_DIR = "./user_data";

export const HEADLESS = process.env.HEADLESS === "true";
export const X_PASSCODE = process.env.X_PASSCODE || "";

export const MESSAGES_CONFIG_PATH = path.resolve("./messages.json");
export const GIFS_DIR = path.resolve("./gifs");

export const CHAT_LIST_URL = "https://x.com/i/chat";
