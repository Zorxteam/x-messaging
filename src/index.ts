import { setupBrowser } from "./browser";
import { randomSleep } from "./humanizer";
import { CHAT_LIST_URL } from "./config";
import { AUTO_LOGIN, X_USERNAME, X_PASSWORD } from "./config";
import path from "path";
import fs from "fs";
import {
  getGroupsFromChatList,
  sendMessageWithGif,
  performRetweets,
  handlePasscodeIfNeeded,
} from "./actions";
import type { Page } from "playwright";

const main = async () => {
  console.log("Запуск бота X Engagement...");
  const { page } = await setupBrowser();

  page.on("crash", () => {
    console.error("⚠️ Page crashed! This usually means insufficient memory.");
    console.error("Railway Free tier (512MB) may not be enough.");
    console.error("Consider upgrading to Hobby plan (1GB+) or add NODE_OPTIONS env var.");
    process.exit(1); 
  });

  try {
    console.log("Браузер запущен. Проверяю страницу /home...");
    await page.goto("https://x.com/home");

    await handlePasscodeIfNeeded(page);

    if (page.url().includes("login") || page.url().includes("flow/login")) {
      if (AUTO_LOGIN && X_USERNAME && X_PASSWORD) {
        console.log("AUTO_LOGIN включён — пытаюсь выполнить вход...");
        try {
          await attemptAutoLogin(page, X_USERNAME, X_PASSWORD);
        } catch (e) {
          console.error("Auto-login не удался:", e);
          console.error("Пожалуйста, войдите вручную.");
          await page.waitForTimeout(60000);
        }
      } else {
        console.error("НЕ ВОШЛИ В АККАУНТ. Пожалуйста, войдите вручную.");
        await page.waitForTimeout(60000);
      }
    }

    while (true) {
      console.log("--- Начало цикла обработки групп ---");

      console.log(`Переход к списку чатов: ${CHAT_LIST_URL}`);
      await page.goto(CHAT_LIST_URL);
      await page.waitForLoadState("domcontentloaded");
      await handlePasscodeIfNeeded(page);
      await randomSleep(5000, 10000); 

      console.log(`Проверка текущего URL: ${page.url()}`);

      let groups = await getGroupsFromChatList(page);

      let retryCount = 0;
      while (groups.length === 0 && retryCount < 5) {
        retryCount++;
        console.warn(
          `Группы не найдены. Повторная попытка ${retryCount}/5 без перезагрузки...`
        );
        await randomSleep(15000, 30000); 
        groups = await getGroupsFromChatList(page);
      }

      if (groups.length === 0) {
        console.warn(
          "Группы не найдены после 5 попыток. Пауза и переход к новому циклу..."
        );
        await randomSleep(120000, 180000); 
        continue;
      }

      console.log(`Найдено ${groups.length} групп для обработки.`);

      const processedIds = new Set<string>();
      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        if (!group) continue;
        if (processedIds.has(group.id)) continue;
        console.log(
          `\n=== Обработка: ${group.name} (${group.requiredRetweets} ретвитов) ===`
        );

        try {
          const chatId = group.id.replace(/^g/, "");
          const chatUrl = `https://x.com/messages/${chatId}`;
          console.log(`Открываю чат: ${chatUrl}`);
          await page.goto(chatUrl);
          await page.waitForLoadState("domcontentloaded");
          await randomSleep(3000, 5000); 

          try {
            const cookieBanner = page.locator('[data-testid="BottomBar"]');
            if (await cookieBanner.isVisible({ timeout: 3000 })) {
              console.log("Обнаружен cookie-баннер, закрываю...");
              await page
                .getByRole("button", {
                  name: /Accept all cookies|Refuse non-essential cookies/i,
                })
                .first()
                .click();
              await randomSleep(1000, 2000);
            }
          } catch {
          }

          console.log("Прокручиваю страницу вниз для загрузки composer...");
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight)
          );
          await randomSleep(2000, 3000); 

          let composerFound = false;
          let composerRetries = 0;
          const maxComposerRetries = 5;

          while (!composerFound && composerRetries < maxComposerRetries) {
            try {
              await page.waitForSelector(
                '[data-testid="dm-composer-textarea"], [data-testid="dmComposerTextInput"]',
                {
                  timeout: 30000, 
                  state: "attached",
                }
              );
              const composer = page
                .locator(
                  '[data-testid="dm-composer-textarea"], [data-testid="dmComposerTextInput"]'
                )
                .first();
              await composer.scrollIntoViewIfNeeded();
              composerFound = true;
              console.log("Composer загружен успешно");
            } catch (e) {
              composerRetries++;
              if (composerRetries < maxComposerRetries) {
                console.warn(
                  `Composer не найден, попытка ${composerRetries}/${maxComposerRetries}, жду дольше...`
                );
                try {
                  const diagDir = path.resolve("diagnostics");
                  await fs.promises.mkdir(diagDir, { recursive: true });
                  const timestamp = new Date()
                    .toISOString()
                    .replace(/[:.]/g, "-");
                  const screenshotPath = path.join(
                    diagDir,
                    `${timestamp}-composer-not-found-chat-${
                      chatId || "unknown"
                    }-attempt-${composerRetries}.png`
                  );
                  await page.screenshot({
                    path: screenshotPath,
                    fullPage: true,
                  });
                  console.log(
                    `📸 Composer screenshot saved: ${screenshotPath}`
                  );
                } catch (sErr) {
                  console.warn(
                    "Failed to save composer diagnostic screenshot:",
                    sErr
                  );
                }
                await randomSleep(10000, 20000);
              } else {
                try {
                  const diagDir = path.resolve("diagnostics");
                  await fs.promises.mkdir(diagDir, { recursive: true });
                  const timestamp = new Date()
                    .toISOString()
                    .replace(/[:.]/g, "-");
                  const finalPath = path.join(
                    diagDir,
                    `${timestamp}-composer-final-error-chat-${
                      chatId || "unknown"
                    }-retries-${composerRetries}.png`
                  );
                  await page.screenshot({ path: finalPath, fullPage: true });
                  console.log(
                    `📸 Final composer screenshot saved: ${finalPath}`
                  );
                } catch (sErr) {
                  console.warn(
                    "Failed to save final composer screenshot:",
                    sErr
                  );
                }
                throw e; 
              }
            }
          }

          await handlePasscodeIfNeeded(page);

          await randomSleep(5000, 10000); 

          await sendMessageWithGif(page);

          await performRetweets(page, group.requiredRetweets);

          console.log(`Группа обработана. Отдыхаю...`);
          await randomSleep(15000, 60000);
          processedIds.add(group.id);

          try {
            console.log("Обновляю список чатов и проверяю passcode...");
            await page.goto(CHAT_LIST_URL, { waitUntil: "domcontentloaded" });
            await handlePasscodeIfNeeded(page);
            if (!page.url().includes("/pin/recovery")) {
              await randomSleep(3000, 6000);
              console.log("Обновляю список групп после обработки...");
              try {
                groups = await getGroupsFromChatList(page);
                console.log(`Обновлено ${groups.length} групп в списке`);
                const newIndex = groups.findIndex((g) => g.id === group.id);
                if (newIndex >= 0) {
                  gi = newIndex; 
                } else {
                  gi = -1; 
                }
              } catch (e) {
                console.warn("Не удалось обновить группы после обработки:", e);
              }
            } else {
              console.log(
                "На странице восстановления после обработки группы, ожидаю обработки passcode..."
              );
              await randomSleep(5000, 10000);
            }
          } catch (refreshErr) {
            console.warn(
              "Ошибка при обновлении списка чатов после группы:",
              refreshErr
            );
          }
        } catch (e) {
          console.error(`Ошибка в группе ${group.link}:`, e);
        }
      }

      console.log("Цикл завершён. Пауза...");
      await randomSleep(120000, 300000); 
    }
  } catch (e) {
    console.error("Фатальная ошибка:", e);
  }
};

main();

async function attemptAutoLogin(
  page: Page,
  username: string,
  password: string
) {
  try {
    const userSelector =
      'input[autocomplete="username"], input[name="text"], input[type="text"]';
    const passSelector =
      'input[type="password"], input[autocomplete="current-password"]';

    const nextSelectors = [
      'button:has-text("Next")',
      'button:has-text("next")',
      'div[role="button"]:has-text("Next")',
      'button:has-text("Далее")',
      'button:has-text("Continue")',
      'button:has-text("Продолжить")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button[type="submit"]',
    ];

    let passwordVisible = false;
    const maxAttempts = 3;
    for (
      let attempt = 1;
      attempt <= maxAttempts && !passwordVisible;
      attempt++
    ) {
      try {
        await page.waitForSelector(userSelector, { timeout: 15000 });
        const userInput = page.locator(userSelector).first();

        await userInput.click({ timeout: 3000 });
        await userInput.fill("");
        await randomSleep(200, 400);
        await userInput.fill(username);
        await randomSleep(400, 1200);

        let clickedNext = false;
        for (const sel of nextSelectors) {
          try {
            const el = page.locator(sel).first();
            if ((await el.count()) > 0) {
              await el.scrollIntoViewIfNeeded({ timeout: 2000 });
              await el.click({ timeout: 3000 });
              clickedNext = true;
              break;
            }
          } catch (e) {
            continue;
          }
        }

        if (!clickedNext) {
          await page.keyboard.press("Enter");
        }

        await randomSleep(1000, 2000); 

        try {
          await page.waitForSelector(passSelector, { timeout: 8000 });
          passwordVisible = true;
          break;
        } catch (e) {
          console.warn(
            `attemptAutoLogin: попытка ${attempt} — поле пароля не появилось`
          );
          await randomSleep(500, 1200);
          continue;
        }
      } catch (e) {
        console.warn(`attemptAutoLogin: ошибка на попытке ${attempt}:`, e);
        await randomSleep(500, 1200);
      }
    }

    if (!passwordVisible) {
      throw new Error(
        "Password field did not appear after multiple username attempts"
      );
    }
    const passInput = page.locator(passSelector).first();
    await randomSleep(500, 1000);

    await passInput.click({ timeout: 3000 });
    await passInput.fill(password);
    await randomSleep(400, 800);

    await page.keyboard.press("Enter");

    try {
      await page.waitForURL(/.*\/home.*/, { timeout: 20000 });
    } catch {
    }

    await randomSleep(1000, 2500);

    if (page.url().includes("login") || page.url().includes("flow/login")) {
      throw new Error("Auto-login did not navigate away from login page");
    }

    console.log(
      "Auto-login: looks like login succeeded, current URL:",
      page.url()
    );
    try {
      const statePath = path.resolve("storageState.json");
      await page.context().storageState({ path: statePath });
      console.log(`Saved storage state to ${statePath}`);
    } catch (e) {
      console.warn("Failed to save storage state:", e);
    }
  } catch (err) {
    console.error("attemptAutoLogin error:", err);
    throw err;
  }
}
