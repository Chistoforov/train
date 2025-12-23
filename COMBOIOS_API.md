# Comboios.live API Документация

## Базовый URL
```
https://comboios.live
```

## Основной эндпоинт

### Получение данных о поездах (vehicles)

**URL:** `https://comboios.live/api/vehicles`

**Метод:** `GET`

**Заголовки:**
```http
User-Agent: Mozilla/5.0 (Chrome/120.0.0.0)
Accept: application/json
```

**Описание:** Возвращает список всех активных поездов в реальном времени.

**Ответ:**
```json
{
  "vehicles": [
    {
      "trainNumber": "12345",
      "service": {
        "code": "45"
      },
      "origin": {
        "code": "94-69005",
        "designation": "Cais do Sodré"
      },
      "destination": {
        "code": "94-69260",
        "designation": "Cascais"
      },
      "lastStation": "94-69187",
      "status": "running",
      "delay": 120
    }
  ]
}
```

**Поля ответа:**
- `vehicles` - массив объектов поездов
  - `trainNumber` - номер поезда (строка)
  - `service.code` - код маршрута/линии (например, "45" для линии Cascais)
  - `origin.code` - код станции отправления
  - `origin.designation` - название станции отправления
  - `destination.code` - код станции назначения
  - `destination.designation` - название станции назначения
  - `lastStation` - код последней пройденной станции
  - `status` - статус поезда (например, "running", "stopped")
  - `delay` - задержка в **секундах** (число)

## Коды станций

### Линия Cascais

| Станция | Код |
|---------|-----|
| Cais do Sodré | `94-69005` |
| Cascais | `94-69260` |
| Carcavelos | `94-69187` |

### Коды маршрутов

| Линия | Код сервиса |
|-------|-------------|
| Cascais Line | `45` |

## Примеры запросов

### 1. Получить все поезда

**cURL:**
```bash
curl -X GET "https://comboios.live/api/vehicles" \
  -H "User-Agent: Mozilla/5.0 (Chrome/120.0.0.0)" \
  -H "Accept: application/json"
```

**JavaScript (fetch):**
```javascript
const response = await fetch('https://comboios.live/api/vehicles', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Chrome/120.0.0.0)',
    'Accept': 'application/json'
  }
});

const data = await response.json();
console.log(data.vehicles);
```

**Node.js (node-fetch):**
```javascript
const fetch = require('node-fetch');

const response = await fetch('https://comboios.live/api/vehicles', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Chrome/120.0.0.0)',
    'Accept': 'application/json'
  },
  timeout: 10000
});

if (response.ok) {
  const data = await response.json();
  console.log(data.vehicles);
}
```

### 2. Фильтрация поездов линии Cascais

**JavaScript:**
```javascript
const response = await fetch('https://comboios.live/api/vehicles', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Chrome/120.0.0.0)',
    'Accept': 'application/json'
  }
});

const data = await response.json();

// Фильтр для линии Cascais (Service 45)
const cascaisTrains = data.vehicles.filter(v => 
  v.service && v.service.code === '45' && 
  (v.destination && (v.destination.code === '94-69260' || v.destination.code === '94-69005') ||
   v.origin && (v.origin.code === '94-69260' || v.origin.code === '94-69005'))
);

console.log(cascaisTrains);
```

### 3. Получить поезда, идущие в конкретном направлении

**Cais do Sodré → Cascais:**
```javascript
const response = await fetch('https://comboios.live/api/vehicles', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Chrome/120.0.0.0)',
    'Accept': 'application/json'
  }
});

const data = await response.json();

const trainsToCascais = data.vehicles.filter(v => 
  v.service && v.service.code === '45' &&
  v.origin && v.origin.code === '94-69005' &&
  v.destination && v.destination.code === '94-69260'
);

console.log(trainsToCascais);
```

**Cascais → Cais do Sodré:**
```javascript
const trainsToCais = data.vehicles.filter(v => 
  v.service && v.service.code === '45' &&
  v.origin && v.origin.code === '94-69260' &&
  v.destination && v.destination.code === '94-69005'
);
```

### 4. Получить поезда с задержкой

```javascript
const response = await fetch('https://comboios.live/api/vehicles', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Chrome/120.0.0.0)',
    'Accept': 'application/json'
  }
});

const data = await response.json();

// Поезда с задержкой более 1 минуты
const delayedTrains = data.vehicles.filter(v => 
  v.delay && v.delay > 60
);

delayedTrains.forEach(train => {
  const delayMinutes = Math.round(train.delay / 60);
  console.log(`Поезд ${train.trainNumber}: задержка ${delayMinutes} минут`);
});
```

### 5. Python пример

```python
import requests

url = "https://comboios.live/api/vehicles"
headers = {
    "User-Agent": "Mozilla/5.0 (Chrome/120.0.0.0)",
    "Accept": "application/json"
}

response = requests.get(url, headers=headers, timeout=10)

if response.status_code == 200:
    data = response.json()
    vehicles = data.get("vehicles", [])
    
    # Фильтр для линии Cascais
    cascais_trains = [
        v for v in vehicles
        if v.get("service", {}).get("code") == "45"
        and (
            v.get("destination", {}).get("code") in ["94-69260", "94-69005"]
            or v.get("origin", {}).get("code") in ["94-69260", "94-69005"]
        )
    ]
    
    for train in cascais_trains:
        delay_seconds = train.get("delay", 0)
        delay_minutes = round(delay_seconds / 60)
        print(f"Поезд {train.get('trainNumber')}: "
              f"{train.get('origin', {}).get('designation')} → "
              f"{train.get('destination', {}).get('designation')}, "
              f"задержка: {delay_minutes} мин")
```

## Важные замечания

1. **Задержка в секундах**: Поле `delay` возвращается в секундах, не в минутах
2. **Timeout**: Рекомендуется устанавливать timeout для запросов (например, 10 секунд)
3. **User-Agent**: API может требовать корректный User-Agent заголовок
4. **CORS**: API может не поддерживать CORS для браузерных запросов, используйте прокси или серверный запрос
5. **Обновление данных**: Данные обновляются в реальном времени, рекомендуется делать запросы периодически

## Обработка ошибок

```javascript
try {
  const response = await fetch('https://comboios.live/api/vehicles', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Chrome/120.0.0.0)',
      'Accept': 'application/json'
    },
    timeout: 10000
  });

  if (response.ok) {
    const data = await response.json();
    if (data && data.vehicles) {
      // Обработка данных
      console.log(`Найдено ${data.vehicles.length} поездов`);
    } else {
      console.log('Нет данных о поездах');
    }
  } else {
    console.error(`Ошибка HTTP: ${response.status}`);
  }
} catch (error) {
  console.error('Ошибка при запросе:', error.message);
}
```

## Использование в проекте

В текущем проекте API используется для получения данных о задержках поездов в реальном времени. Статическое расписание комбинируется с данными о задержках из API для отображения актуальной информации.

**Файлы проекта:**
- `server.js` - основной сервер с обработкой API запросов
- `api/trains.js` - модуль для работы с API поездов


