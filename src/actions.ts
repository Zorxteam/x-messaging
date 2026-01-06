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

export const handlePasscodeIfNeeded = async (page: Page): Promise<void> => {
  try {
    const passcodeContainer = page.locator(
      '[data-testid="pin-code-input-container"]'
    );

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

        await randomSleep(5000, 8000); 

        if (page.url().includes("/pin/recovery")) {
          console.log("Waiting for navigation away from recovery page...");
          try {
            await page.waitForURL(
              (url) => !url.toString().includes("/pin/recovery"),
              {
                timeout: 30000,
              }
            );
            console.log(`Navigated to: ${page.url()}`);
          } catch (e) {
            console.warn(
              "Did not navigate away from recovery page, continuing anyway"
            );
          }
        }

        await randomSleep(3000, 5000); 
      } else {
        console.error("Passcode needed but X_PASSCODE not found in .env");
      }
    }
  } catch (e) {
    console.log("Passcode check error (ignoring if just not found):", e);
  }
};

const loadMessagesConfig = (): MessageConfig[] => {
  try {
    const data = fs.readFileSync(MESSAGES_CONFIG_PATH, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load messages.json:", e);
    return [{ text: "LFG! 🚀", gif: "default.gif" }];
  }
};

export const getGroupsFromChatList = async (
  page: Page
): Promise<GroupInfo[]> => {
  console.log("Scraping groups from chat list...");
  const groups: GroupInfo[] = [];

  try {
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    let passcodeAttempts = 0;
    const maxPasscodeAttempts = 7; 

    while (
      page.url().includes("/pin/recovery") &&
      passcodeAttempts < maxPasscodeAttempts
    ) {
      passcodeAttempts++;
      console.log(
        `On recovery page, handling passcode (attempt ${passcodeAttempts}/${maxPasscodeAttempts})...`
      );
      await handlePasscodeIfNeeded(page);
      await randomSleep(5000, 10000); 

      if (!page.url().includes("/pin/recovery")) {
        console.log(
          `Successfully navigated away from recovery page to: ${page.url()}`
        );
        break;
      } else {
        console.log("Still on recovery page, will retry passcode...");
      }
    }

    if (page.url().includes("/pin/recovery")) {
      console.log(
        `Still on recovery page after ${passcodeAttempts} attempts, forcing navigation to chat list...`
      );
      await page.goto(CHAT_LIST_URL);
      await page.waitForLoadState("domcontentloaded");
      await randomSleep(5000, 10000);
    } else if (
      !page.url().includes("/i/chat") &&
      !page.url().includes("/messages")
    ) {
      console.error(`Not on chat page! URL: ${currentUrl}`);
      console.log(`Redirecting to chat list: ${CHAT_LIST_URL}`);
      try {
        await page.goto(CHAT_LIST_URL);
        await page.waitForLoadState("domcontentloaded");
        await randomSleep(5000, 10000); 
      } catch (e) {
        console.error("Failed to navigate to chat list:", e);
        console.log("Waiting for navigation to complete...");
        await randomSleep(5000, 8000);
      }
    }

    await page.waitForLoadState("domcontentloaded");
    await randomSleep(8000, 12000); 

    console.log("Waiting for chat items to appear...");
    try {
      await page.waitForSelector('[data-testid^="dm-conversation-item-"]', {
        state: "attached",
        timeout: 60000, 
      });
      console.log(
        "First chat item found, waiting for list to stabilize (may be slow)..."
      );
      await randomSleep(120000, 180000); 

      let count = await page
        .locator('[data-testid^="dm-conversation-item-"]')
        .count();
      console.log(`Found ${count} chat items initially loaded`);

      if (count === 0) {
        throw new Error("No chat items found after waiting");
      }

      console.log("Scrolling to load all chat items...");

      let scrollContainer = await page.$(
        '[data-testid="dm-inbox-panel"] [style*="overflow"]'
      );
      if (!scrollContainer) {
        scrollContainer = await page.$(
          '[data-testid="dm-inbox-panel"] div[style*="overflow-y"]'
        );
      }
      if (!scrollContainer) {
        scrollContainer = await page.$(
          'div[style*="overflow"][style*="height: 100vh"]'
        );
      }

      if (scrollContainer) {
        console.log("Found scroll container, performing scroll...");

        for (let i = 0; i < 25; i++) {
          const previousCount = await page
            .locator('[data-testid^="dm-conversation-item-"]')
            .count();

          await scrollContainer.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          });
          await randomSleep(3000, 5000); 

          const currentCount = await page
            .locator('[data-testid^="dm-conversation-item-"]')
            .count();
          console.log(
            `Scroll iteration ${i + 1}/25: ${currentCount} items loaded`
          );

          if (i > 5 && currentCount === previousCount) {
            console.log("No more items loading, stopping scroll");
            break;
          }
        }

        await scrollContainer.evaluate((el) => {
          el.scrollTop = 0;
        });
        await randomSleep(10000, 15000); 

        count = await page
          .locator('[data-testid^="dm-conversation-item-"]')
          .count();
        console.log(`After scrolling, found ${count} chat items total`);
      } else {
        console.warn(
          "Could not find scroll container, will work with currently loaded items"
        );
      }
    } catch (e) {
      console.error(
        "Chat items not found, saving diagnostic screenshot and HTML..."
      );
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const diagDir = path.resolve("diagnostics");

      try {
        await fs.promises.mkdir(diagDir, { recursive: true });

        const screenshotPath = path.join(
          diagDir,
          `${timestamp}-chat-not-found.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Screenshot saved: ${screenshotPath}`);

        const htmlPath = path.join(diagDir, `${timestamp}-chat-not-found.html`);
        const html = await page.content();
        await fs.promises.writeFile(htmlPath, html, "utf8");
        console.log(`💾 HTML saved: ${htmlPath}`);

        console.log(`Current URL: ${page.url()}`);
      } catch (diagError) {
        console.error("Failed to save diagnostics:", diagError);
      }

      console.log("Attempting multiple retries to find chat items...");
      let chatItemsFound = false;
      let itemRetries = 0;
      const maxItemRetries = 5;

      while (!chatItemsFound && itemRetries < maxItemRetries) {
        itemRetries++;
        console.log(
          `Retry attempt ${itemRetries}/${maxItemRetries} to find chat items...`
        );
        await randomSleep(10000, 20000); // 10-20 секунд между попытками

        try {
          await page.waitForSelector('[data-testid^="dm-conversation-item-"]', {
            state: "attached",
            timeout: 60000, // 60 секунд
          });
          await randomSleep(3000, 5000); // Дольше ждем

          const retryCount = await page
            .locator('[data-testid^="dm-conversation-item-"]')
            .count();
          console.log(`Chat items found! Count: ${retryCount}`);
          chatItemsFound = true;
        } catch (itemError) {
          if (itemRetries < maxItemRetries) {
            console.warn(
              `Still not found, will retry ${
                maxItemRetries - itemRetries
              } more time(s)...`
            );
          } else {
            // Last attempt - try reload
            console.log("All retries failed, attempting page reload...");
            try {
              await page.goto(CHAT_LIST_URL, { waitUntil: "domcontentloaded" });
              console.log(`After goto, URL: ${page.url()}`);
              await randomSleep(3000, 5000); // Дольше ждем после goto

              await handlePasscodeIfNeeded(page);
              console.log(`After passcode check, URL: ${page.url()}`);

              if (page.url().includes("/pin/recovery")) {
                console.log(
                  "Still on recovery page after passcode, forcing navigation..."
                );
                await page.goto(CHAT_LIST_URL, {
                  waitUntil: "domcontentloaded",
                });
                await randomSleep(5000, 8000); // Еще дольше ждем
              }

              await randomSleep(5000, 10000); // Большая пауза перед retry

              await page.waitForSelector(
                '[data-testid^="dm-conversation-item-"]',
                {
                  state: "attached",
                  timeout: 60000, // 60 секунд
                }
              );
              await randomSleep(5000, 8000); // Дольше ждем

              const finalCount = await page
                .locator('[data-testid^="dm-conversation-item-"]')
                .count();
              console.log(
                `Chat items found after reload! Count: ${finalCount}`
              );
              chatItemsFound = true;
            } catch (reloadError) {
              console.error(
                "Failed to find chat items even after reload:",
                reloadError
              );
              throw reloadError;
            }
          }
        }
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
          const nameElement = await item.$(
            ".font-bold, .font-chirp.line-clamp-1"
          );
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

  // Check if we can type (if we are in the chat) - поддерживаем оба варианта composer
  const inputSelector =
    '[data-testid="dm-composer-textarea"], [data-testid="dmComposerTextInput"]';
  const composerInput = page.locator(inputSelector).first();

  if ((await composerInput.count()) === 0) {
    console.error("Message input not found. Are we in the chat?");
    return;
  }

  // Определяем, какой тип composer используется
  const isRichTextEditor =
    (await page.locator('[data-testid="dmComposerTextInput"]').count()) > 0;
  console.log(
    `Using ${
      isRichTextEditor ? "rich text editor" : "simple textarea"
    } composer`
  );

  // Load messages config and select random message
  const messagesConfig = loadMessagesConfig();
  const selectedMessage =
    messagesConfig[Math.floor(Math.random() * messagesConfig.length)];

  console.log(
    `Selected message: "${selectedMessage.text}" with GIF: ${selectedMessage.gif || "none"}`
  );

  // Check if GIF is specified and exists
  if (!selectedMessage.gif || selectedMessage.gif.trim() === "") {
    console.log("No GIF specified, sending message without GIF...");
    await composerInput.click();
    await randomSleep(300, 600);

    // Для rich text editor используем type(), для textarea - fill()
    if (isRichTextEditor) {
      await composerInput.type(selectedMessage.text, { delay: 50 });
    } else {
      await composerInput.fill(selectedMessage.text);
    }
    await randomSleep(500, 1500);

    await page.keyboard.press("Enter");
    await randomSleep(3000, 5000);
    return;
  }

  const gifPath = path.join(GIFS_DIR, selectedMessage.gif);

  // Check if GIF file exists
  if (!fs.existsSync(gifPath)) {
    console.error(`GIF file not found: ${gifPath}`);
    console.log("Sending message without GIF...");
    await composerInput.click();
    await randomSleep(300, 600);

    // Для rich text editor используем type(), для textarea - fill()
    if (isRichTextEditor) {
      await composerInput.type(selectedMessage.text, { delay: 50 });
    } else {
      await composerInput.fill(selectedMessage.text);
    }
    await randomSleep(500, 1500);

    await page.keyboard.press("Enter");
    await randomSleep(3000, 5000);
    return;
  }

  // Type message first
  console.log(`Typing: "${selectedMessage.text}"`);
  await composerInput.click();
  await randomSleep(300, 600);

  // Для rich text editor используем type(), для textarea - fill()
  if (isRichTextEditor) {
    await composerInput.type(selectedMessage.text, { delay: 50 });
  } else {
    await composerInput.fill(selectedMessage.text);
  }
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

    // Прокручиваем чат вниз и обратно вверх, чтобы загрузить все сообщения
    console.log("Скроллю чат для загрузки сообщений...");
    const chatScroller = page.locator('[data-testid="DmScrollerContainer"]');
    if ((await chatScroller.count()) > 0) {
      await chatScroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
      await randomSleep(1000, 2000);
      await chatScroller.evaluate((el) => (el.scrollTop = 0));
      await randomSleep(1000, 2000);
      await chatScroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
      await randomSleep(1000, 2000);
    }

    // Find messages from other users
    // В новом интерфейсе X все сообщения имеют data-testid="messageEntry"
    const allMessages = page.locator('div[data-testid="messageEntry"]');
    const messageCount = await allMessages.count();

    console.log(`Found ${messageCount} total messages in chat`);

    // Collect unique user profiles from recent messages
    const userProfiles: string[] = [];

    // Take last messages (iterate from end)
    const startIndex = Math.max(0, messageCount - 20); // Last 20 messages

    for (
      let i = messageCount - 1;
      i >= startIndex && userProfiles.length < count;
      i--
    ) {
      try {
        const messageDiv = allMessages.nth(i);

        // В новом интерфейсе ищем аватар пользователя - элемент с data-testid="UserAvatar-Container-unknown"
        const avatarContainer = messageDiv.locator(
          '[data-testid="UserAvatar-Container-unknown"]'
        );
        const hasAvatar = await avatarContainer.count();

        if (hasAvatar === 0) {
          console.log(
            `Message ${i}: Skipping (no avatar - likely system message or our message)`
          );
          continue;
        }

        console.log(`Message ${i}: Processing (has avatar - other user)`);

        // Ищем ссылку на профиль внутри аватара
        const avatarLink = avatarContainer.locator('a[role="link"]').first();
        const linkCount = await avatarLink.count();

        console.log(`Found ${linkCount} profile links`);

        if (linkCount > 0) {
          let href = await avatarLink.getAttribute("href");
          console.log(`Raw href: "${href}"`);

          if (href) {
            // Normalize URL
            if (href.startsWith("/")) {
              href = `https://x.com${href}`;
              console.log(`Normalized to: "${href}"`);
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
        // Wait longer to allow tweets to load (40 seconds)
        console.log("Waiting 40s for profile tweets to load...");
        await randomSleep(40000, 40000);

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
