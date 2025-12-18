import { setupBrowser } from "./browser";
import { randomSleep } from "./humanizer";
import { CHAT_LIST_URL } from "./config";
import {
  getGroupsFromChatList,
  sendMessageWithGif,
  performRetweets,
  handlePasscodeIfNeeded,
} from "./actions";

const main = async () => {
  console.log("Запуск бота X Engagement...");
  const { page } = await setupBrowser();

  try {
    console.log("Браузер запущен. Проверяю страницу /home...");
    await page.goto("https://x.com/home");

    // Проверка passcode при начальной загрузке
    await handlePasscodeIfNeeded(page);

    // Проверка входа
    if (page.url().includes("login") || page.url().includes("flow/login")) {
      console.error("НЕ ВОШЛИ В АККАУНТ. Пожалуйста, войдите вручную.");
      await page.waitForTimeout(60000); // Даем время на вход
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
