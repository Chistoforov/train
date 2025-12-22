# Настройка проекта на Vercel

## Что было сделано

1. ✅ Создана папка `api/` с serverless function `trains.js`
2. ✅ Создан файл `vercel.json` для конфигурации
3. ✅ API ключ CP теперь может использоваться из переменных окружения

## Переменные окружения (опционально)

Если хотите использовать переменную окружения для API ключа CP (вместо захардкоженного значения):

1. Зайдите в настройки проекта на Vercel
2. Перейдите в раздел "Environment Variables"
3. Добавьте переменную:
   - **Name**: `CP_API_KEY`
   - **Value**: `ca3923e4-1d3c-424f-a3d0-9554cf3ef859`

**Примечание**: API ключ уже захардкожен в коде как fallback, так что это не обязательно.

## Структура проекта для Vercel

```
train/
├── api/
│   └── trains.js          # Serverless function для /api/trains
├── public/
│   ├── index.html         # Главная страница
│   ├── sw.js              # Service Worker
│   ├── manifest.json      # PWA манифест
│   └── logo.png           # Иконка
├── vercel.json            # Конфигурация Vercel
└── package.json           # Зависимости
```

## Деплой

Проект готов к деплою на Vercel. Просто:

1. Закоммитьте изменения
2. Запушьте в репозиторий
3. Vercel автоматически задеплоит проект

Или используйте Vercel CLI:
```bash
vercel --prod
```

## Проверка работы

После деплоя проверьте:
- Главная страница: `https://your-domain.vercel.app/`
- API endpoint: `https://your-domain.vercel.app/api/trains?stationId=94-21014`





