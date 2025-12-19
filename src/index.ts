import { setupBrowser } from "./browser";
import { randomSleep } from "./humanizer";
import { CHAT_LIST_URL } from "./config";
import { AUTO_LOGIN, X_USERNAME, X_PASSWORD } from "./config";
import path from "path";
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
      await randomSleep(5000, 10000); // Дольше ждем после passcode

      // Убедиться, что на нужной странице после passcode/перенаправлений
      console.log(`Проверка текущего URL: ${page.url()}`);

      // Получаем все группы из списка чатов (с повторными попытками если не найдены)
      let groups = await getGroupsFromChatList(page);

      // ВАЖНО: Сохраняем список групп ПЕРЕД началом обработки
      // Это предотвращает проблемы при изменении порядка чатов во время обработки

      // Если группы не найдены, пытаемся еще раз без перезагрузки страницы (больше попыток и дольше)
      let retryCount = 0;
      while (groups.length === 0 && retryCount < 5) {
        retryCount++;
        console.warn(`Группы не найдены. Повторная попытка ${retryCount}/5 без перезагрузки...`);
        await randomSleep(15000, 30000); // 15-30 секунд между попытками
        groups = await getGroupsFromChatList(page);
      }

      if (groups.length === 0) {
        console.warn("Группы не найдены после 5 попыток. Пауза и переход к новому циклу...");
        await randomSleep(120000, 180000); // 2-3 минуты перед новым циклом
        continue;
      }

      console.log(`Найдено ${groups.length} групп для обработки.`);

      for (const group of groups) {
        console.log(
          `\n=== Обработка: ${group.name} (${group.requiredRetweets} ретвитов) ===`
        );

        try {
          // Переходим напрямую к чату по ID (избегаем проблем с виртуальным списком)
          // group.id содержит "g1234..." - убираем префикс "g"
          const chatId = group.id.replace(/^g/, '');
          const chatUrl = `https://x.com/messages/${chatId}`;
          console.log(`Открываю чат: ${chatUrl}`);
          await page.goto(chatUrl);
          await page.waitForLoadState("domcontentloaded");
          await randomSleep(3000, 5000); // Дольше ждем загрузки чата

          // Жду загрузки чата с повторами (увеличенное время ожидания)
          let composerFound = false;
          let composerRetries = 0;
          const maxComposerRetries = 5;

          while (!composerFound && composerRetries < maxComposerRetries) {
            try {
              await page.waitForSelector('[data-testid="dm-composer-textarea"]', {
                timeout: 30000, // 30 секунд
              });
              composerFound = true;
              console.log("Composer загружен успешно");
            } catch (e) {
              composerRetries++;
              if (composerRetries < maxComposerRetries) {
                console.warn(`Composer не найден, попытка ${composerRetries}/${maxComposerRetries}, жду дольше...`);
                await randomSleep(10000, 20000); // 10-20 секунд между попытками
              } else {
                throw e; // После 5 попыток бросаем ошибку
              }
            }
          }

          // Обработка passcode если X перенаправил на страницу восстановления
          await handlePasscodeIfNeeded(page);

          await randomSleep(5000, 10000); // Дольше ждем перед отправкой сообщения

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

        await randomSleep(1000, 2000); // Даём странице время обновиться

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
    throw err;
  }
}
