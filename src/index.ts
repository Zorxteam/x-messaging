import { setupBrowser } from "./browser";
import { randomSleep } from "./humanizer";
import { CHAT_LIST_URL } from "./config";
import { AUTO_LOGIN, X_USERNAME, X_PASSWORD } from "./config";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import {
  getGroupsFromChatList,
  sendMessageWithGif,
  performRetweets,
  handlePasscodeIfNeeded,
} from "./actions";
import type { Page } from "playwright";

// Diagnostic buffers (kept in memory while process runs)
const DIAG_CONSOLE: Array<any> = [];
const DIAG_NETWORK: Array<any> = [];

async function dumpDiagnostics(page: Page, label = "diag") {
  try {
    const t = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.resolve("diagnostics", `${t}-${label}`);
    await fs.promises.mkdir(dir, { recursive: true });

    try {
      await page.screenshot({
        path: path.join(dir, "screenshot.png"),
        fullPage: true,
      });
    } catch (e) {}

    try {
      const html = await page.content();
      await fs.promises.writeFile(path.join(dir, "page.html"), html, "utf8");
    } catch (e) {}

    try {
      await fs.promises.writeFile(
        path.join(dir, "console.json"),
        JSON.stringify(DIAG_CONSOLE, null, 2),
        "utf8"
      );
    } catch (e) {}

    try {
      await fs.promises.writeFile(
        path.join(dir, "network.json"),
        JSON.stringify(DIAG_NETWORK.slice(-500), null, 2),
        "utf8"
      );
    } catch (e) {}

    try {
      const cookies = await page.context().cookies();
      await fs.promises.writeFile(
        path.join(dir, "cookies.json"),
        JSON.stringify(cookies, null, 2),
        "utf8"
      );
    } catch (e) {}

    console.log("Wrote diagnostics to", dir);
  } catch (e) {
    console.error("dumpDiagnostics failed:", e);
  }
}

const main = async () => {
  console.log("Запуск бота X Engagement...");
  const { page } = await setupBrowser();

  // Attach diagnostic listeners
  DIAG_CONSOLE.length = 0;
  DIAG_NETWORK.length = 0;
  page.on("console", (msg) => {
    try {
      DIAG_CONSOLE.push({
        text: msg.text(),
        type: msg.type(),
        location: msg.location(),
      });
      if (DIAG_CONSOLE.length > 500) DIAG_CONSOLE.shift();
    } catch (e) {}
  });
  page.on("request", (req) => {
    try {
      DIAG_NETWORK.push({
        type: "request",
        url: req.url(),
        method: req.method(),
        postData: req.postData(),
        time: Date.now(),
      });
      if (DIAG_NETWORK.length > 2000) DIAG_NETWORK.shift();
    } catch (e) {}
  });
  page.on("response", (res) => {
    try {
      DIAG_NETWORK.push({
        type: "response",
        url: res.url(),
        status: res.status(),
        time: Date.now(),
      });
      if (DIAG_NETWORK.length > 2000) DIAG_NETWORK.shift();
    } catch (e) {}
  });

  try {
    console.log("Браузер запущен. Проверяю страницу /home...");
    await page.goto("https://x.com/home");

    // Проверка passcode при начальной загрузке
    await handlePasscodeIfNeeded(page);

    // Проверка входа и автологин если включён
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
        await page.waitForTimeout(60000); // Даем время на вход
      }
    }

    while (true) {
      console.log("--- Начало цикла обработки групп ---");

      // Переход к списку чатов и сбор групп
      console.log(`Переход к списку чатов: ${CHAT_LIST_URL}`);
      await page.goto(CHAT_LIST_URL);
      await page.waitForLoadState("domcontentloaded");
      await handlePasscodeIfNeeded(page);
      await randomSleep(3000, 6000);

      // Убедиться, что на нужной странице после passcode/перенаправлений
      console.log(`Проверка текущего URL: ${page.url()}`);

      // Получаем все группы из списка чатов
      const groups = await getGroupsFromChatList(page);

      // ВАЖНО: Сохраняем список групп ПЕРЕД началом обработки
      // Это предотвращает проблемы при изменении порядка чатов во время обработки

      if (groups.length === 0) {
        console.warn("Группы не найдены. Повтор через паузу...");
        await randomSleep(60000, 120000);
        continue;
      }

      console.log(`Найдено ${groups.length} групп для обработки.`);

      for (const group of groups) {
        console.log(
          `\n=== Обработка: ${group.name} (${group.requiredRetweets} ретвитов) ===`
        );

        try {
          // Возвращаюсь к списку чатов, чтобы кликнуть по элементу
          await page.goto(CHAT_LIST_URL);
          await page.waitForLoadState("domcontentloaded");
          await randomSleep(1000, 2000);

          // Кликаю по элементу чата чтобы открыть его
          console.log(`Кликаю по элементу чата: ${group.link}`);
          const chatItem = page.locator(`[data-testid="${group.link}"]`);
          await chatItem.click();

          // Жду загрузки чата
          await page.waitForSelector('[data-testid="dm-composer-textarea"]', {
            timeout: 10000,
          });

          // Обработка passcode если X перенаправил на страницу восстановления
          await handlePasscodeIfNeeded(page);

          await randomSleep(3000, 6000);

          // Отправка сообщения с GIF
          await sendMessageWithGif(page);

          // Ретвиты
          await performRetweets(page, group.requiredRetweets);

          console.log(`Группа обработана. Отдыхаю...`);
          // Рандомная пауза между группами для имитации человека
          await randomSleep(15000, 60000);
        } catch (e) {
          console.error(`Ошибка в группе ${group.link}:`, e);
        }
      }

      console.log("Цикл завершён. Пауза...");
      await randomSleep(120000, 300000); // 2-5 mins
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
  // Ориентировочный двухшаговый flow: ввод логина -> Next -> ввод пароля -> Enter
  try {
    // Создаём папку для скриншотов диагностики
    const screenshotDir = path.resolve("diagnostics/screenshots");
    await fs.promises.mkdir(screenshotDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // Будем пытаться ввести логин несколько раз — иногда форма перерендеривается
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

    // Скриншот 1: Начальное состояние страницы логина
    await page.screenshot({
      path: `${screenshotDir}/${timestamp}-01-initial.png`,
      fullPage: true
    });
    console.log("📸 Screenshot 1: Initial login page");

    // Системное движение мыши ОДИН РАЗ в начале
    runSystemMouseWiggle();
    await randomSleep(1000, 2000);

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

        // Очищаем и заполняем поле username
        await userInput.click({ timeout: 3000 });
        await userInput.fill("");
        await randomSleep(200, 400);
        await userInput.fill(username);
        await randomSleep(400, 1200);

        // Скриншот 2: После ввода username
        await page.screenshot({
          path: `${screenshotDir}/${timestamp}-02-username-filled-attempt-${attempt}.png`,
          fullPage: true
        });
        console.log(`📸 Screenshot 2: Username filled (attempt ${attempt})`);

        // Нажимаем кнопку Next
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

        // Fallback: Enter если кнопка не найдена
        if (!clickedNext) {
          await page.keyboard.press("Enter");
        }

        // Скриншот 3: После нажатия Next
        await randomSleep(1000, 2000); // Даём странице время обновиться
        await page.screenshot({
          path: `${screenshotDir}/${timestamp}-03-after-next-attempt-${attempt}.png`,
          fullPage: true
        });
        console.log(`📸 Screenshot 3: After clicking Next (attempt ${attempt})`);

        // Подождём, появился ли пароль
        try {
          await page.waitForSelector(passSelector, { timeout: 8000 });
          passwordVisible = true;
          break;
        } catch (e) {
          console.warn(
            `attemptAutoLogin: попытка ${attempt} — поле пароля не появилось`
          );
          // Если не последний проход, попробуем снова — иногда форма перерендеривается
          await randomSleep(500, 1200);
          continue;
        }
      } catch (e) {
        console.warn(`attemptAutoLogin: ошибка на попытке ${attempt}:`, e);
        await randomSleep(500, 1200);
      }
    }

    if (!passwordVisible) {
      // Скриншот 4: Финальное состояние, если поле пароля не появилось
      await page.screenshot({
        path: `${screenshotDir}/${timestamp}-04-final-no-password.png`,
        fullPage: true
      });
      console.log("📸 Screenshot 4: Final state - password field not found");

      // Сохраняем HTML для детальной диагностики
      const htmlContent = await page.content();
      const htmlPath = `${screenshotDir}/${timestamp}-page-content.html`;
      await fs.promises.writeFile(htmlPath, htmlContent);
      console.log(`💾 Saved HTML to ${htmlPath}`);

      // Диагностика: выведем видимые кнопки/кнопки и HTML заголовок формы
      try {
        const btns = await page.$$eval('button, div[role="button"]', (els) =>
          els.map((el) => (el as HTMLElement).innerText).slice(0, 40)
        );
        console.error("attemptAutoLogin: visible buttons (sample):", btns);
      } catch (e2) {
        console.error("attemptAutoLogin: failed to enumerate buttons:", e2);
      }

      console.error(`\n🔍 DIAGNOSTIC INFO:`);
      console.error(`   Screenshots saved to: ${screenshotDir}`);
      console.error(`   Timestamp: ${timestamp}`);
      console.error(`   Current URL: ${page.url()}\n`);

      throw new Error(
        "Password field did not appear after multiple username attempts"
      );
    }
    const passInput = page.locator(passSelector).first();
    await randomSleep(500, 1000);

    // Вводим пароль
    await passInput.click({ timeout: 3000 });
    await passInput.fill(password);
    await randomSleep(400, 800);

    // Нажимаем Enter для входа
    await page.keyboard.press("Enter");

    // Ждем навигации после логина
    try {
      await page.waitForURL(/.*\/home.*/, { timeout: 20000 });
    } catch (e) {
      // Навигация могла не произойти (SPA), проверим URL/селекторы ниже
    }

    await randomSleep(1000, 2500);

    // Простая проверка успеха: если URL всё ещё содержит login — считаем неудачным
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
    try {
      await dumpDiagnostics(page, "attemptAutoLogin-failure");
    } catch (e) {
      console.error("Failed to dump diagnostics:", e);
    }
    throw err;
  }
}

// Системное движение мыши через Python pyautogui
function runSystemMouseWiggle() {
  try {
    const pythonScript = path.resolve("wiggle_mouse.py");
    execSync(`python3 "${pythonScript}"`, { stdio: "inherit", timeout: 3000 });
  } catch (e) {
    console.log("⚠️  Mouse wiggle failed - ensure pyautogui is installed: pip3 install pyautogui");
  }
}
