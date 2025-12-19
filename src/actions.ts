import { Page } from "playwright";
import {
  X_PASSCODE,
  MESSAGES_CONFIG_PATH,
  GIFS_DIR,
  CHAT_LIST_URL,
} from "./config";
import { randomSleep } from "./humanizer";
import fs from "fs";
import path from "path";

interface MessageConfig {
  text: string;
  gif: string;
}

interface GroupInfo {
  name: string;
  id: string;
  link: string;
  requiredRetweets: number;
}

/**
 * Checks if passcode modal is visible and enters it if needed.
 * This handles the case where X redirects to /i/chat/pin/recovery when entering chats.
 */
export const handlePasscodeIfNeeded = async (page: Page): Promise<void> => {
  try {
    const passcodeContainer = page.locator(
      '[data-testid="pin-code-input-container"]'
    );

    // Wait briefly to see if passcode modal appears
    await passcodeContainer
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});

    if (await passcodeContainer.isVisible()) {
      console.log("Passcode modal detected.");
      if (X_PASSCODE && X_PASSCODE.length === 4) {
        console.log("Entering passcode...");
        const inputs = passcodeContainer.locator("input");
        const count = await inputs.count();
        for (let i = 0; i < count; i++) {
          await inputs.nth(i).click();
          await page.keyboard.type(X_PASSCODE[i]);
          await randomSleep(100, 300);
        }
        console.log("Passcode entered.");

        // Wait for passcode modal to disappear or navigation away from /pin/recovery
        await randomSleep(2000, 3000);

        // Check if we're still on recovery page and wait for navigation
        if (page.url().includes("/pin/recovery")) {
          console.log("Waiting for navigation away from recovery page...");
          try {
            await page.waitForURL(
              (url) => !url.toString().includes("/pin/recovery"),
              {
                timeout: 10000,
              }
            );
            console.log(`Navigated to: ${page.url()}`);
          } catch (e) {
            console.warn(
              "Did not navigate away from recovery page, continuing anyway"
            );
          }
        }

        await randomSleep(1000, 2000);
      } else {
        console.error("Passcode needed but X_PASSCODE not found in .env");
      }
    }
  } catch (e) {
    console.log("Passcode check error (ignoring if just not found):", e);
  }
};

/**
 * Load messages configuration from JSON file
 */
const loadMessagesConfig = (): MessageConfig[] => {
  try {
    const data = fs.readFileSync(MESSAGES_CONFIG_PATH, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load messages.json:", e);
    return [{ text: "LFG! 🚀", gif: "default.gif" }];
  }
};

/**
 * Scrapes the chat list page and extracts all group conversations with their rules
 */
export const getGroupsFromChatList = async (
  page: Page
): Promise<GroupInfo[]> => {
  console.log("Scraping groups from chat list...");
  const groups: GroupInfo[] = [];

  try {
    // Verify we're on the chat list page
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // If on recovery page, handle passcode (may need multiple attempts)
    let passcodeAttempts = 0;
    const maxPasscodeAttempts = 5;

    while (page.url().includes("/pin/recovery") && passcodeAttempts < maxPasscodeAttempts) {
      passcodeAttempts++;
      console.log(`On recovery page, handling passcode (attempt ${passcodeAttempts}/${maxPasscodeAttempts})...`);
      await handlePasscodeIfNeeded(page);
      await randomSleep(2000, 3000);

      // Check if navigated away from recovery page
      if (!page.url().includes("/pin/recovery")) {
        console.log(`Successfully navigated away from recovery page to: ${page.url()}`);
        break;
      } else {
        console.log("Still on recovery page, will retry passcode...");
      }
    }

    // If still stuck after multiple attempts, force navigation
    if (page.url().includes("/pin/recovery")) {
      console.log(
        `Still on recovery page after ${passcodeAttempts} attempts, forcing navigation to chat list...`
      );
      await page.goto(CHAT_LIST_URL);
      await page.waitForLoadState("domcontentloaded");
      await randomSleep(2000, 3500);
    } else if (
      !page.url().includes("/i/chat") &&
      !page.url().includes("/messages")
    ) {
      console.error(`Not on chat page! URL: ${currentUrl}`);
      console.log(`Redirecting to chat list: ${CHAT_LIST_URL}`);
      try {
        await page.goto(CHAT_LIST_URL);
        await page.waitForLoadState("domcontentloaded");
        await randomSleep(2000, 3500);
      } catch (e) {
        console.error("Failed to navigate to chat list:", e);
        console.log("Waiting for navigation to complete...");
        await randomSleep(5000, 8000);
      }
    }

    // Wait for page to fully load after any redirects
    await page.waitForLoadState("domcontentloaded");
    await randomSleep(2000, 3000);

    // Wait for chat list to load with extended timeout
    console.log("Waiting for chat items to appear...");
    try {
      // Wait for at least one chat item to be attached to DOM (virtual list may load slowly)
      await page.waitForSelector('[data-testid^="dm-conversation-item-"]', {
        state: 'attached',
        timeout: 30000,
      });
      console.log("First chat item found, waiting for list to stabilize...");
      await randomSleep(2000, 3000);

      // Verify we have chat items now
      let count = await page.locator('[data-testid^="dm-conversation-item-"]').count();
      console.log(`Found ${count} chat items initially loaded`);

      if (count === 0) {
        throw new Error("No chat items found after waiting");
      }

      // Scroll down to load all items in virtual list
      console.log("Scrolling to load all chat items...");
      const scrollContainer = await page.$('[data-testid="dm-inbox-panel"] [style*="overflow"]');

      if (scrollContainer) {
        // Scroll down in steps to trigger virtual list loading
        for (let i = 0; i < 5; i++) {
          await scrollContainer.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          });
          await randomSleep(500, 1000);
        }

        // Scroll back to top
        await scrollContainer.evaluate((el) => {
          el.scrollTop = 0;
        });
        await randomSleep(1000, 2000);

        // Count again after scrolling
        count = await page.locator('[data-testid^="dm-conversation-item-"]').count();
        console.log(`After scrolling, found ${count} chat items total`);
      } else {
        console.warn("Could not find scroll container, will work with currently loaded items");
      }
    } catch (e) {
      // Chat items not found - save diagnostic info
      console.error(
        "Chat items not found, saving diagnostic screenshot and HTML..."
      );
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const diagDir = path.resolve("diagnostics");

      try {
        await fs.promises.mkdir(diagDir, { recursive: true });

        // Save screenshot
        const screenshotPath = path.join(
          diagDir,
          `${timestamp}-chat-not-found.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Screenshot saved: ${screenshotPath}`);

        // Save HTML
        const htmlPath = path.join(diagDir, `${timestamp}-chat-not-found.html`);
        const html = await page.content();
        await fs.promises.writeFile(htmlPath, html, "utf8");
        console.log(`💾 HTML saved: ${htmlPath}`);

        console.log(`Current URL: ${page.url()}`);
      } catch (diagError) {
        console.error("Failed to save diagnostics:", diagError);
      }

      // Try to navigate back to chat list and retry
      console.log("Attempting to reload chat list page...");
      try {
        await page.goto(CHAT_LIST_URL, { waitUntil: "domcontentloaded" });
        console.log(`After goto, URL: ${page.url()}`);
        await randomSleep(1000, 2000);

        await handlePasscodeIfNeeded(page); // Check for passcode after reload
        console.log(`After passcode check, URL: ${page.url()}`);

        // If still on recovery page, force navigate again
        if (page.url().includes("/pin/recovery")) {
          console.log(
            "Still on recovery page after passcode, forcing navigation..."
          );
          await page.goto(CHAT_LIST_URL, { waitUntil: "domcontentloaded" });
          await randomSleep(2000, 3000);
        }

        await randomSleep(3000, 5000);
        console.log("Retrying to find chat items...");

        // Retry waiting for chat items (with longer timeout for virtual list)
        await page.waitForSelector('[data-testid^="dm-conversation-item-"]', {
          state: 'attached',
          timeout: 30000,
        });
        await randomSleep(2000, 3000);

        const retryCount = await page.locator('[data-testid^="dm-conversation-item-"]').count();
        console.log(`Chat items found after retry! Count: ${retryCount}`);
      } catch (retryError) {
        console.error("Failed to reload and find chat items:", retryError);
        throw retryError; // Re-throw to be caught by outer try-catch
      }
    }

    // Find all conversation items
    const conversationItems = await page.$$(
      '[data-testid^="dm-conversation-item-"]'
    );
    console.log(`Found ${conversationItems.length} conversations`);

    for (const item of conversationItems) {
      try {
        // Extract testid to get the group ID
        const testId = await item.getAttribute("data-testid");
        if (!testId) continue;

        // Extract group ID (pattern: dm-conversation-item-gXXXXXXXXXXXXXXXXXXX)
        const match = testId.match(/dm-conversation-item-(g\d+)/);
        if (!match) continue;
        const groupId = match[1];

        // Get group name - try multiple selectors as Twitter may change classes
        let name = null;

        // Try aria-description first (most reliable)
        const ariaDesc = await item.getAttribute("aria-description");
        if (ariaDesc) {
          // Extract first line from aria-description (format: "Group Name, ...")
          name = ariaDesc.split(",")[0].trim();
        }

        // Fallback: try .font-bold or .font-chirp with line-clamp-1
        if (!name) {
          const nameElement = await item.$(".font-bold, .font-chirp.line-clamp-1");
          if (nameElement) {
            name = await nameElement.textContent();
          }
        }

        if (!name || !name.trim()) {
          console.log("  ⊘ Skipping item - could not extract name");
          continue;
        }
        name = name.trim();

        // Parse rule from name (e.g., "Тест 1/3" -> 3, "1/5" -> 5)
        // ONLY process chats that have the "1/n" pattern
        const ruleMatch = name.match(/1\/(\d+)/);

        if (!ruleMatch) {
          console.log(`  ⊘ Skipping "${name}" - no 1/n pattern`);
          continue;
        }

        const requiredRetweets = parseInt(ruleMatch[1], 10);

        // Store testid for clicking (instead of constructing URL)
        const link = testId; // We'll use this as selector to click

        groups.push({
          name: name.trim(),
          id: groupId,
          link, // Now contains testid
          requiredRetweets,
        });

        console.log(`  - ${name} (${requiredRetweets} retweets required)`);
      } catch (e) {
        console.error("Error parsing conversation item:", e);
      }
    }
  } catch (e) {
    console.error("Error scraping chat list:", e);
  }

  return groups;
};

export const sendMessageWithGif = async (page: Page) => {
  console.log("Starting message sequence...");

  // Check if we can type (if we are in the chat)
  const inputSelector = '[data-testid="dm-composer-textarea"]';
  if ((await page.locator(inputSelector).count()) === 0) {
    console.error("Message input not found. Are we in the chat?");
    return;
  }

  // Load messages config and select random message
  const messagesConfig = loadMessagesConfig();
  const selectedMessage =
    messagesConfig[Math.floor(Math.random() * messagesConfig.length)];
  const gifPath = path.join(GIFS_DIR, selectedMessage.gif);

  console.log(
    `Selected message: "${selectedMessage.text}" with GIF: ${selectedMessage.gif}`
  );

  // Check if GIF file exists
  if (!fs.existsSync(gifPath)) {
    console.error(`GIF file not found: ${gifPath}`);
    console.log("Sending message without GIF...");
    await page.locator(inputSelector).click();
    await page.locator(inputSelector).fill(selectedMessage.text);
    await randomSleep(500, 1500);

    await page.keyboard.press("Enter");
    await randomSleep(3000, 5000);
    return;
  }

  // Type message first
  console.log(`Typing: "${selectedMessage.text}"`);
  await page.locator(inputSelector).click();
  await randomSleep(300, 600);
  await page.locator(inputSelector).fill(selectedMessage.text);
  await randomSleep(500, 1500);

  // Upload GIF - несколько fallback методов
  console.log("Uploading GIF...");
  let gifUploaded = false;

  try {
    // Способ 1: Прямой file input (если уже есть на странице)
    const directFileInput = page.locator('input[type="file"]').first();
    if ((await directFileInput.count()) > 0) {
      console.log("Trying direct file input...");
      await directFileInput.setInputFiles(gifPath);
      await randomSleep(500, 1000);
      gifUploaded = true;
      console.log("GIF uploaded via direct file input");
    }
  } catch (e) {
    console.log("Direct file input method failed:", e);
  }

  // Способ 2: Кликаем на кнопку attachment, затем загружаем
  if (!gifUploaded) {
    try {
      console.log("Trying attachment button...");
      const attachmentButton = page.locator(
        '[data-testid="dm-composer-attachment-button"]'
      );
      await attachmentButton.click();
      await randomSleep(300, 500);

      // После клика должен появиться file input
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(gifPath);
      await randomSleep(500, 1000);
      gifUploaded = true;
      console.log("GIF uploaded via attachment button");
    } catch (e) {
      console.log("Attachment button method failed:", e);
    }
  }

  // Способ 3: Ищем скрытый file input с data-testid
  if (!gifUploaded) {
    try {
      console.log("Trying testid file input...");
      const fileInput = page.locator('[data-testid="dm-composer-file-input"]');
      if ((await fileInput.count()) > 0) {
        await fileInput.setInputFiles(gifPath);
        await randomSleep(500, 1000);
        gifUploaded = true;
        console.log("GIF uploaded via testid file input");
      }
    } catch (e) {
      console.log("Testid file input method failed:", e);
    }
  }

  if (!gifUploaded) {
    console.warn("Failed to upload GIF, continuing without it...");
  }

  // Send with Enter
  console.log("Sending...");
  await page.keyboard.press("Enter");
  await randomSleep(3000, 5000);
};

export const performRetweets = async (page: Page, count: number) => {
  console.log(`Looking for ${count} users to retweet...`);

  try {
    // Wait for chat to load
    await randomSleep(2000, 3000);

    // Find messages from other users
    // Structure: <div class="flex py-1 justify-start" data-testid="message-XXX"> contains avatar links
    // Our messages: <div class="flex py-1 justify-end">
    const allMessages = page.locator('div[data-testid^="message-"]');
    const messageCount = await allMessages.count();

    console.log(`Found ${messageCount} total messages in chat`);

    // Collect unique user profiles from recent messages
    const userProfiles: string[] = [];

    // Take last messages (iterate from end)
    const startIndex = Math.max(0, messageCount - 10); // Last 10 messages

    for (
      let i = messageCount - 1;
      i >= startIndex && userProfiles.length < count;
      i--
    ) {
      try {
        const messageDiv = allMessages.nth(i);

        // Check if THIS div has justify-start (other users) or justify-end (our messages)
        // Structure: <div class="flex py-1 justify-start" data-testid="message-XXX">
        const divClass =
          (await messageDiv.getAttribute("class").catch(() => "")) || "";

        // Skip our own messages (justify-end)
        if (divClass.includes("justify-end")) {
          console.log(`Message ${i}: Skipping (our message - justify-end)`);
          continue;
        }

        if (!divClass.includes("justify-start")) {
          console.log(
            `Message ${i}: Skipping (no justify-start class, class="${divClass.substring(
              0,
              50
            )}")`
          );
          continue;
        }

        console.log(`Message ${i}: Processing (other user - justify-start)`);

        // Find avatar link in THIS container
        // Structure: div > grid > avatar area > a href
        const avatarLink = messageDiv
          .locator('a[href^="https://x.com/"], a[href^="/"]')
          .first();
        const linkCount = await avatarLink.count();

        console.log(`Found ${linkCount} profile links`);

        if (linkCount > 0) {
          let href = await avatarLink.getAttribute("href");
          console.log(`Raw href: ${href}`);

          if (href) {
            // Normalize URL
            if (href.startsWith("/")) {
              href = `https://x.com${href}`;
            }

            // Filter out non-profile links
            if (
              !href.includes("/messages/") &&
              !href.includes("/status/") &&
              !href.includes("/i/") &&
              !href.includes("/settings")
            ) {
              // Extract base profile URL (remove any query params or anchors)
              const baseUrl = href.split("?")[0].split("#")[0];

              if (!userProfiles.includes(baseUrl)) {
                userProfiles.push(baseUrl);
                console.log(`✓ Added user: ${baseUrl}`);
              } else {
                console.log(`- Already have user: ${baseUrl}`);
              }
            } else {
              console.log(`- Filtered out: ${href}`);
            }
          }
        } else {
          console.log(`No links found in message ${i}`);
        }
      } catch (e) {
        console.log(`Error processing message ${i}:`, e);
      }
    }

    // IMPORTANT: We save the list of users BEFORE starting retweets
    // This prevents issues with new messages arriving during the retweet process
    console.log(
      `Will retweet posts from ${
        userProfiles.length
      } users: ${userProfiles.join(", ")}`
    );

    // Save current chat URL to return to after retweets
    const chatUrl = page.url();
    console.log(`Saved chat URL: ${chatUrl}`);

    // For each user: open profile → find first tweet → retweet → go back
    let retweeted = 0;

    for (const profileUrl of userProfiles) {
      if (retweeted >= count) break;

      try {
        console.log(`Opening profile: ${profileUrl}`);

        // Open user profile
        await page.goto(profileUrl);
        await page.waitForLoadState("domcontentloaded");
        await randomSleep(2000, 4000);

        // Find first tweet on page
        const firstTweet = page.locator('article[data-testid="tweet"]').first();

        if ((await firstTweet.count()) === 0) {
          console.log("No tweets found on profile, skipping... (this is OK)");
          continue;
        }

        console.log("Found first tweet, looking for retweet button...");

        // Find retweet button inside tweet
        const retweetButton = firstTweet.locator('[data-testid="retweet"]');
        const unretweetButton = firstTweet.locator('[data-testid="unretweet"]');

        // Check if already retweeted
        if ((await unretweetButton.count()) > 0) {
          console.log(
            `✓ Already retweeted post from ${profileUrl} (skipping, this is OK)`
          );
          retweeted++; // Count as success

          // Return to chat
          console.log(`Returning to chat: ${chatUrl}`);
          await page.goto(chatUrl);
          await randomSleep(1000, 2000);
          continue;
        }

        if ((await retweetButton.count()) > 0) {
          await retweetButton.click();
          await randomSleep(500, 1000);

          // After click, menu appears with Retweet/Quote options
          // Find "Retweet" button in menu
          const retweetMenuItem = page.locator(
            '[data-testid="retweetConfirm"]'
          );

          if ((await retweetMenuItem.count()) > 0) {
            await retweetMenuItem.click();
            console.log(`✓ Retweeted post from ${profileUrl}`);
            retweeted++;
            await randomSleep(2000, 3000);

            // Navigate back to chat page using saved URL
            console.log(`Returning to chat: ${chatUrl}`);
            await page.goto(chatUrl);
            await randomSleep(1000, 2000);
          } else {
            console.log(
              "Retweet menu not found, maybe already retweeted? (this is OK)"
            );
            retweeted++; // Count as success anyway
          }
        } else {
          console.log("Retweet button not found (this is OK)");
          retweeted++; // Count as success anyway
        }
      } catch (e) {
        console.error(`Error retweeting from ${profileUrl}:`, e);
      }
    }

    console.log(`Retweeted ${retweeted} out of ${count} required posts`);
  } catch (e) {
    console.error("Error in performRetweets:", e);
  }
};
