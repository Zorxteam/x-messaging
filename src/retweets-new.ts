import { Page } from "playwright";
import { randomSleep } from "./humanizer";

/**
 * Performs retweets for the specified number of users
 * 1. Finds last N messages from other users in chat (not our own messages)
 * 2. Clicks on each user's avatar to open their profile
 * 3. Retweets their first (latest) tweet
 */
export const performRetweetsNew = async (page: Page, count: number) => {
  console.log(`Looking for ${count} users to retweet...`);

  try {
    // Wait for chat to load
    await randomSleep(2000, 3000);

    // Find all messages from other users (justify-start means messages on the left side)
    // Our messages have justify-end
    const otherUserMessages = page
      .locator(".justify-start")
      .locator('[data-testid^="message-"]');
    const messageCount = await otherUserMessages.count();

    console.log(`Found ${messageCount} messages from other users`);

    if (messageCount === 0) {
      console.log("No messages from other users found");
      return;
    }

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
        const message = otherUserMessages.nth(i);

        // Find profile link inside message
        // Usually it's <a href="https://x.com/Username">
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
            // Extract username from URL
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

    // For each user: open profile → find first tweet → retweet
    let retweeted = 0;

    for (const profileUrl of userProfiles) {
      if (retweeted >= count) break;

      try {
        console.log(`Opening profile: ${profileUrl}`);

        // Open user profile
        await page.goto(profileUrl);
        await page.waitForLoadState("domcontentloaded");
        await randomSleep(2000, 4000);

        // Find first tweet on page with retries — profiles may lazy-load tweets
        const maxProfileAttempts = 4;
        let profileAttempt = 0;
        let firstTweet = page.locator('article[data-testid="tweet"]').first();
        let tweetFound = false;

        while (profileAttempt < maxProfileAttempts && !tweetFound) {
          profileAttempt++;
          try {
            // Wait for at least one tweet to be attached
            await page.waitForSelector('article[data-testid="tweet"]', {
              timeout: 15000,
              state: "attached",
            });
            // Give a short moment for render
            await randomSleep(800, 1600);
            firstTweet = page.locator('article[data-testid="tweet"]').first();
            if ((await firstTweet.count()) > 0) {
              tweetFound = true;
              break;
            }
          } catch (err) {
            // Not found yet — attempt to scroll to trigger loading and retry
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
          continue;
        }

        console.log("Found first tweet, looking for retweet button...");

        // Find retweet button inside tweet
        const retweetButton = firstTweet.locator('[data-testid="retweet"]');

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
