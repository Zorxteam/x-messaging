# Деплой на Railway - Инструкция

## Подготовка

Проект настроен для автоматического деплоя на Railway с правильными настройками headless режима.

## Шаги

### 1. Создание проекта в Railway

1. Зайдите на https://railway.app
2. Войдите через GitHub
3. "New Project" → "Deploy from GitHub repo"
4. Выберите ваш репозиторий

### 2. Настройка переменных окружения

**Минимальные (обязательно):**
```env
X_PASSCODE=1234
```

**Для авто-логина (опционально):**
```env
AUTO_LOGIN=true
X_USERNAME=ваш_логин_x
X_PASSWORD=ваш_пароль_x
```

**Важно:**
- `HEADLESS` включается **автоматически** в Railway - не нужно указывать!
- Локально можно `HEADLESS=false` для отладки с браузером

### 3. Первый деплой

Railway автоматически:
- Обнаружит `Dockerfile`
- Соберет образ
- Запустит бот

Смотрите логи: Dashboard → Deployments → Logs

### 4. Ожидаемое поведение

**Нормально:**
- "No web process detected" - это норма, бот не веб-сервер
- Логи: "Запуск бота X Engagement..." "Браузер запущен..."

**Проблемы:**
- Out of memory → Нужен платный план Railway
- Composer not found → Проверьте, работает ли бот локально

## Использование storageState для логина

Если авто-логин не работает или нужна 2FA:

1. **Локально:**
   ```bash
   HEADLESS=false bun run start
   ```

2. Войдите вручную в браузер

3. Бот сохранит `storageState.json`

4. **Деплой с сохраненной сессией:**
   - Удалите `storageState.json` из `.dockerignore` (строка 33)
   - Закоммитьте файл
   - Передеплойте на Railway

## Требования к памяти

**ВАЖНО:** Railway Free tier (512MB RAM) может быть **недостаточно** для Playwright + Chrome!

### Рекомендации:
1. **Минимум:** Railway Hobby plan ($5/месяц) - 1GB RAM
2. **Оптимально:** 2GB+ RAM для стабильной работы

### Если используете Free tier:
Добавьте переменную окружения в Railway:
```
NODE_OPTIONS=--max-old-space-size=450
```

Это ограничит память Node.js, оставив больше для Chrome.

## Troubleshooting

### Page crashed / Browser crashed
**Причина:** Недостаточно памяти в Railway

**Решения:**
1. Upgrade на Railway Hobby plan (1GB RAM минимум)
2. Добавить `NODE_OPTIONS=--max-old-space-size=450`
3. Проверить, что headless режим включен (автоматически в Railway)

### Browser crashed / Missing X server
✅ **Исправлено!** - Headless автоматически включается в Railway

### Бот не находит чаты
- Убедитесь, что `storageState.json` с валидной сессией
- Проверьте `X_PASSCODE` если X запрашивает

## Команды Railway CLI (опционально)

```bash
# Установка CLI
npm i -g @railway/cli

# Логин
railway login

# Просмотр логов
railway logs

# Деплой
railway up
```
