import { Page } from "playwright";
import { randomSleep } from "./humanizer";
import fs from "fs";
import path from "path";

export const performRetweetsNew = async (page: Page, count: number) => {
  console.log(`Looking for ${count} users to retweet...`);

  try {
    await randomSleep(2000, 3000);

    const otherUserMessages = page
      .locator(".justify-start")
      .locator('[data-testid^="message-"]');
    const messageCount = await otherUserMessages.count();

    console.log(`Found ${messageCount} messages from other users`);

    if (messageCount === 0) {
      console.log("No messages from other users found");
      return;
    }

    const userProfiles: string[] = [];

    const startIndex = Math.max(0, messageCount - 10); 

    for (
      let i = messageCount - 1;
      i >= startIndex && userProfiles.length < count;
      i--
    ) {
      try {
        const message = otherUserMessages.nth(i);

        const profileLink = message
          .locator('a[href^="https://x.com/"][href*="/"]')
          .first();

        if ((await profileLink.count()) > 0) {
          const href = await profileLink.getAttribute("href");

          if (
            href &&
            !href.includes("/messages/") &&
            !href.includes("/status/")
          ) {
            if (!userProfiles.includes(href)) {
              userProfiles.push(href);
              console.log(`Found user: ${href}`);
            }
          }
        }
      } catch (e) {
        console.log(`Error processing message ${i}:`, e);
      }
    }

    console.log(
      `Will retweet posts from ${
        userProfiles.length
      } users: ${userProfiles.join(", ")}`
    );

    let retweeted = 0;

    for (const profileUrl of userProfiles) {
      if (retweeted >= count) break;

      try {
        console.log(`Opening profile: ${profileUrl}`);

        await page.goto(profileUrl);
        await page.waitForLoadState("domcontentloaded");
        await randomSleep(2000, 4000);
        console.log("Waiting 40s for profile tweets to load...");
        await randomSleep(40000, 40000);

        const maxProfileAttempts = 4;
        let profileAttempt = 0;
        let firstTweet = page.locator('article[data-testid="tweet"]').first();
        let tweetFound = false;

        while (profileAttempt < maxProfileAttempts && !tweetFound) {
          profileAttempt++;
          try {
            await page.waitForSelector('article[data-testid="tweet"]', {
              timeout: 15000,
              state: "attached",
            });
            await randomSleep(800, 1600);
            firstTweet = page.locator('article[data-testid="tweet"]').first();
            if ((await firstTweet.count()) > 0) {
              tweetFound = true;
              break;
            }
          } catch (err) {
            console.log(
              `No tweets detected yet on profile (attempt ${profileAttempt}/${maxProfileAttempts}), scrolling and retrying...`
            );
            try {
              await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            } catch (e) {}
            await randomSleep(1500, 3000);
          }
        }

        if (!tweetFound) {
          console.log("No tweets found on profile after retries, skipping...");
          try {
            const diagDir = path.resolve("diagnostics");
            await fs.promises.mkdir(diagDir, { recursive: true });
            let username = "unknown";
            try {
              const u = new URL(profileUrl, "https://x.com");
              username = u.pathname.replace(/^\/+|\/+$/g, "");
            } catch (e) {}
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const shotPath = path.join(
              diagDir,
              `${timestamp}-profile-no-tweets-${username || "unknown"}.png`
            );
            await page.screenshot({ path: shotPath, fullPage: true });
            console.log(`📸 Profile screenshot saved: ${shotPath}`);
          } catch (sErr) {
            console.warn("Failed to save profile screenshot:", sErr);
          }
          continue;
        }

        console.log("Found first tweet, looking for retweet button...");

        const retweetButton = firstTweet.locator('[data-testid="retweet"]');

        if ((await retweetButton.count()) > 0) {
          await retweetButton.click();
          await randomSleep(500, 1000);

          const retweetMenuItem = page.locator(
            '[data-testid="retweetConfirm"]'
          );

          if ((await retweetMenuItem.count()) > 0) {
            await retweetMenuItem.click();
            console.log(`✓ Retweeted post from ${profileUrl}`);
            retweeted++;
            await randomSleep(2000, 4000);
          } else {
            console.log("Retweet menu not found, maybe already retweeted?");
          }
        } else {
          console.log("Retweet button not found");
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
