import path from 'path';

// Path to the persistent browser profile
export const USER_DATA_DIR = './user_data';

// Credentials from environment variables
export const HEADLESS = process.env.HEADLESS === 'true';
export const X_PASSCODE = process.env.X_PASSCODE || '';

// Paths for messages and GIFs configuration
export const MESSAGES_CONFIG_PATH = path.resolve('./messages.json');
export const GIFS_DIR = path.resolve('./gifs');

// Chat list URL - we'll scrape groups from here dynamically
export const CHAT_LIST_URL = 'https://x.com/i/chat';
