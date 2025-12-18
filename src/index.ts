import { setupBrowser } from "./browser";
import { randomSleep } from "./humanizer";
import { CHAT_LIST_URL, USER_DATA_DIR } from "./config";
import { AUTO_LOGIN, X_USERNAME, X_PASSWORD } from "./config";
import path from "path";
import {
  getGroupsFromChatList,
  sendMessageWithGif,
  performRetweets,
  handlePasscodeIfNeeded,
} from "./actions";
import type { Page, Locator } from "playwright";

const main = async () => {
  console.log("Запуск бота X Engagement...");
  const { page } = await setupBrowser();

  try {
    // Helper: smooth human-like mouse move + click at coordinates
    async function humanMouseMoveAndClick(p: Page, x: number, y: number) {
      const steps = 12 + Math.floor(Math.random() * 10);
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1 || 1);
        // jitter decreases as we approach target
        const jitter = (1 - t) * (6 + Math.random() * 8);
        const rx = x + (Math.random() - 0.5) * jitter;
        const ry = y + (Math.random() - 0.5) * jitter;
        try {
          await p.mouse.move(rx, ry, { steps: 1 });
        } catch (e) {}
        await p.waitForTimeout(6 + Math.random() * 18);
      }
      try {
        await p.mouse.down();
        await p.waitForTimeout(20 + Math.random() * 120);
        await p.mouse.up();
      } catch (e) {
        // swallow
      }
    }

    // Helper: human-like click by Locator (dispatch pointer events as fallback)
    async function humanClickElement(el: Locator) {
      try {
        await el.scrollIntoViewIfNeeded();
      } catch (e) {}
      const box = await el.boundingBox();
      if (box) {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        try {
          await humanMouseMoveAndClick(page, cx, cy);
          return;
        } catch (e) {
          // fallback to element.click
        }
      }
      try {
        // dispatch pointer events then click
        await el.evaluate((node) => {
          const rect = (node as HTMLElement).getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const opts: PointerEventInit = {
            clientX: cx,
            clientY: cy,
            bubbles: true,
          };
          node.dispatchEvent(new PointerEvent("pointerover", opts));
          node.dispatchEvent(new PointerEvent("pointerenter", opts));
          node.dispatchEvent(new PointerEvent("pointerdown", opts));
          node.dispatchEvent(new PointerEvent("pointerup", opts));
        });
        await el.click({ force: true });
      } catch (e) {
        try {
          await el.click({ force: true });
        } catch (e2) {}
      }
    }
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
        // Иногда поле заполнено автоматически — очистим перед заполнением
        try {
          const box = await userInput.boundingBox();
          if (box) {
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            try {
              await page.mouse.move(x, y);
              await page.mouse.click(x, y);
            } catch (e) {}
          } else {
            await userInput.click({ timeout: 3000 });
          }
          await userInput.fill("");
        } catch (e) {}
        await randomSleep(200, 600);
        // Кликаем перед вводом для стабильности
        try {
          const box2 = await userInput.boundingBox();
          if (box2) {
            const x2 = box2.x + box2.width / 2;
            const y2 = box2.y + box2.height / 2;
            try {
              await page.mouse.move(x2, y2);
              await page.mouse.click(x2, y2);
            } catch (e) {}
          } else {
            try {
              await userInput.click({ timeout: 3000 });
            } catch (e) {}
          }
        } catch (e) {}
        await userInput.fill(username);
        await randomSleep(400, 1200);

        // Попытаемся нажать Next через список селекторов
        let clickedNext = false;
        for (const sel of nextSelectors) {
          const el = page.locator(sel).first();
          if ((await el.count()) > 0) {
            try {
              try {
                await el.scrollIntoViewIfNeeded();
              } catch (e) {}
              const boxn = await el.boundingBox();
              if (boxn) {
                const nx = boxn.x + boxn.width / 2;
                const ny = boxn.y + boxn.height / 2;
                try {
                  await page.mouse.move(nx, ny);
                  await page.mouse.click(nx, ny);
                } catch (e) {
                  // fallback to element click
                  await el.click({ timeout: 5000, force: true });
                }
              } else {
                await el.click({ timeout: 5000, force: true });
              }
              clickedNext = true;
              break;
            } catch (e) {
              // ignore and continue
            }
          }
        }

        if (!clickedNext) {
          // fallback: несколько Enter
          for (let i = 0; i < 2; i++) {
            await page.keyboard.press("Enter");
            await randomSleep(300, 800);
          }
        }

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
      // Диагностика: выведем видимые кнопки/кнопки и HTML заголовок формы
      try {
        const btns = await page.$$eval('button, div[role="button"]', (els) =>
          els.map((el) => (el as HTMLElement).innerText).slice(0, 40)
        );
        console.error("attemptAutoLogin: visible buttons (sample):", btns);
      } catch (e2) {
        console.error("attemptAutoLogin: failed to enumerate buttons:", e2);
      }
      throw new Error(
        "Password field did not appear after multiple username attempts"
      );
    }
    const passInput = page.locator(passSelector).first();
    await randomSleep(500, 1500);
    // Клик по полю пароля перед вводом — эмуляция мыши
    try {
      const pbox = await passInput.boundingBox();
      if (pbox) {
        const px = pbox.x + pbox.width / 2;
        const py = pbox.y + pbox.height / 2;
        try {
          await page.mouse.move(px, py);
          await page.mouse.click(px, py);
        } catch (e) {
          try {
            await passInput.click({ timeout: 3000 });
          } catch (e) {}
        }
      } else {
        try {
          await passInput.click({ timeout: 3000 });
        } catch (e) {}
      }
    } catch (e) {}
    await passInput.fill(password);
    await randomSleep(400, 1200);

    // Нажимаем на кнопку входа (попробуем разные варианты) либо Enter
    const loginBtn = page.locator(
      'button:has-text("Log in"), button:has-text("Log in to X"), button[type="submit"]'
    );
    if ((await loginBtn.count()) > 0) {
      await loginBtn.first().click();
    } else {
      await page.keyboard.press("Enter");
    }

    // Дать время на перенаправление
    try {
      await page.waitForNavigation({ timeout: 20000 });
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
