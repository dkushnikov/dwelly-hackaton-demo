# Проверка Lettings Village

Проверено 10 октября 2026 года. Соседний checkout используется только как источник agent API, публичных тестовых данных и записей. Актуальные проверки BI и упаковки приведены в конце документа; первые разделы фиксируют исходную проверку деревни.

## Автоматические тесты

Команда базового запуска:

```sh
make test
```

Фактический результат:

```text
python3 -m pytest -q -c pyproject.toml tests
sss...................................                                   [100%]
35 passed, 3 skipped in 0.05s
node --test tests/frontend.test.mjs
tests 6
pass 6
fail 0
```

Три пропуска — интеграционные тесты, которым нужен явный путь к checkout агента.

Команда с настоящим agent harness:

```sh
make test PYTHON=/Users/dkushnikov/Code/lettings-ops-agent/.venv/bin/python TEST_ARGS=--agent-root=/Users/dkushnikov/Code/lettings-ops-agent
```

Фактический результат:

```text
......................................                                   [100%]
38 passed in 0.46s
node --test tests/frontend.test.mjs
✔ SSE redelivery cannot duplicate actions
✔ a resolved decision does not close the ticket without episode_end
✔ player turn clears after reply and each session remains independent
✔ all four golden recordings run to completion without fabricated gate blocks
✔ malformed recording is rejected before playback
✔ untrusted content stays literal and read gates do not clutter the timeline
tests 6
pass 6
fail 0
```

В bridge-тестах используются настоящий CaseAgent, PolicyGate и MockAdapter. Ответы модели подменены детерминированным test client; API-запросы не выполняются. Проверены запрет изменения реквизитов, отсутствие соответствующего effect, привязка заявки к P-005 и передача отказа владельца в следующий контекст.

## Статические проверки

```sh
make lint PYTHON=/Users/dkushnikov/Code/lettings-ops-agent/.venv/bin/python
```

Вывод:

```text
All checks passed!
node --check demo/web/app.js
node --check demo/web/village.js
node --check demo/web/model.js
node --check demo/web/sw.js
```

Обе Compose-конфигурации разобраны YAML-парсером:

```text
compose.yaml: valid YAML; village service found
deploy/compose.live.yaml: valid YAML; village service found
```

## Записи и сборка

```sh
make import-replays
make build
```

Фактический вывод последнего импорта:

```text
routine.jsonl: 51 events, 31194 bytes, real F01 recording
approval.jsonl: 41 events, 24480 bytes, real F02 recording
fraud.jsonl: 33 events, 20491 bytes, real F07 recording
vulnerable.jsonl: 46 events, 37890 bytes, real F08 recording
```

Фактический вывод последней сборки:

```text
Static replay build: /Users/dkushnikov/Documents/ChatGPT/Dwelly Hackathon Demo/dist
4 authentic recordings; no runtime sessions, agent source, credentials, CDN or API dependency.
Deployment archive: /Users/dkushnikov/Documents/ChatGPT/Dwelly Hackathon Demo/artifacts/lettings-village-static.zip (58697 bytes)
```

## HTTP и браузер

После запуска `make game-replay` выполнен:

```sh
curl -fsS http://127.0.0.1:8787/api/health
```

Ответ:

```json
{"ok": true, "live": false, "protocol": 1, "message": "Replay mode · no API calls", "max_sessions": 32}
```

Проверки в Codex in-app browser:

- Старт четырёх параллельных записей, переключение карточек и завершение: 17 подтверждённых effects суммарно.
- Fraud replay: отображён реальный отказ, handover и итог `2 allowed writes · 0 approval requests · 0 gate blocks · 5 withheld actions`.
- Пауза и переход к следующему значимому событию; скорость 4×.
- Импорт `approval.jsonl` через штатный file chooser: открылась записанная заявка F02 на P-006.
- Presenter 1920×1080: карта, управление и карточки помещаются на экран.
- Mobile 390×844: горизонтального переполнения нет; DOM сообщил `documentWidth: 375, viewport: 390`.
- Во время обычной сетевой проверки список console errors/warnings был пуст.
- Сервер остановлен через Ctrl+C, затем страница перезагружена. Четыре истории вновь стартовали из service-worker cache. Повторно поднимать сервер для этой проверки не потребовалось.

Скриншоты: `artifacts/village-presenter.jpg`, `artifacts/village-mobile.jpg`.

## Найденные и исправленные проблемы

Первый локальный bind был заблокирован песочницей:

```text
make game-replay
ERROR: [Errno 1] error while attempting to bind on address ('127.0.0.1', 8787): [errno 1] operation not permitted
```

Повторный запуск с разрешением на локальный сервер успешен. Первый curl из песочницы не видел открытый порт (`curl: (7) Failed to connect`); после разрешения получен ответ health выше.

В начале lint нашёл B023 в замыкании импортера и E741 в имени переменной — исправлены. Первый pytest с отдельным аргументом пути выбрал rootdir соседнего репозитория и не распознал `--agent-root`; Makefile теперь явно передаёт `-c pyproject.toml tests`, а путь задаётся через `--agent-root=...`.

В сценарии согласования исправлен property P-002 на фактический P-006 из записанного fixture. Presenter layout уплотнён после проверки 1920×1080. Добавлены проверки Host против DNS rebinding, типов импортированных событий и отдельное обозначение идемпотентного подтверждения без повторной анимации dispatch.

## Что не подтверждено

Реальные платные LLM-вызовы и качество полного live-эпизода не проверялись: credentials не читались и не подключались. Тестовый отказ владельца подтверждает доставку evidence следующему ходу, а не семантическую реакцию настоящей модели.

Docker и cloudflared отсутствуют в окружении. Контейнерная сборка, внешний DNS/TLS, Cloudflare Access и публичное SSE-соединение не проверены. Публикация не выполнена. Локальный сервер остановлен после проверки; повторный запуск — `make game-replay`. Уже открытая и закешированная страница продолжает работать автономно.

## Дополнение: BI, итоговая сборка и тесты

После добавления Intelligence выполнено:

```sh
make import-insights
```

```text
insights-corpus.json: 50 jobs · public_corpus · SHA-256 9671bc2cc5f3ff478fb7e28dab96d75b65c8ac057ab8eb8a6d7d073385cca9a2
insights-lab.json: 84 jobs · portfolio_lab · SHA-256 fb59b95779da5228ed23938c50e3a385002ac814b7065fba31a3e413a971d0dc
```

```sh
make test PYTHON=/Users/dkushnikov/Code/lettings-ops-agent/.venv/bin/python TEST_ARGS=--agent-root=/Users/dkushnikov/Code/lettings-ops-agent
make lint PYTHON=/Users/dkushnikov/Code/lettings-ops-agent/.venv/bin/python
```

Вывод итогового прогона (test names сокращены, счётчики сохранены):

```text
........................................                                 [100%]
40 passed in 0.44s
node --test tests/*.test.mjs
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 51.99125
All checks passed!
node --check demo/web/app.js
node --check demo/web/village.js
node --check demo/web/model.js
node --check demo/web/sw.js
node --check demo/web/insights.js
node --check demo/web/insights-model.js
```

BI-тесты проверяют реальные ошибки аналитики: исключение 40 landlord replies из staff count, отсутствие суммирования money mentions в spend, VAT и неизвестные веса, peers одного типа/района, отсутствие rank при малой выборке, парные positive/negative правила, привязку feedback к данным, валидацию ledger и дедупликацию повторно проигранных traces.

```sh
make build
```

```text
Static replay build: /Users/dkushnikov/Documents/ChatGPT/Dwelly Hackathon Demo/dist
4 authentic recordings; no runtime sessions, agent source, credentials, CDN or API dependency.
BI: 50 public corpus cases + 84 clearly labelled synthetic portfolio jobs; local review feedback.
Deployment archive: /Users/dkushnikov/Documents/ChatGPT/Dwelly Hackathon Demo/artifacts/lettings-village-static.zip (106940 bytes)
Archive verified: 21 explicit static files; no runtime sessions or reviews
```

Добавлен явный setuptools backend и список пакетов/assets: документированный `pip install .` должен работать с несколькими Python-каталогами. Проверена настоящая сборка wheel:

```sh
python3 -m pip wheel . --no-deps --no-cache-dir --wheel-dir artifacts/wheels
```

```text
Created wheel for lettings-village: filename=lettings_village-0.1.0-py3-none-any.whl size=127597 sha256=3b178c8c079d1987afd0e1326fd9f70d4de4261f830c22c93b40367a2aa80db7
Successfully built lettings-village
Wheel verified: lettings_village-0.1.0-py3-none-any.whl, 35 files, all runtime and BI assets present
```

Первый `python3 -m pip wheel . --no-deps --wheel-dir artifacts/wheels` не смог разрешить `pypi.org` внутри песочницы (`NameResolutionError`, затем `No matching distribution found for setuptools>=68`). Повторный запуск с сетевым разрешением успешен. Установлен только изолированный build backend, runtime-зависимости команда `--no-deps` не устанавливала.

Browser QA через Codex in-app browser:

- Public corpus показывает 595 staff interventions, 40 исключённых landlord replies, 13 дней медианы и £663 округлённой оценки (£662,50 в JSON).
- Portfolio lab → plumber: 24 jobs; C-001 имеет ROI proxy 1.55×, C-007 — 0.63×; это явно обозначенная выдуманная fixture.
- Review queue: три предложения; отзыв `snoozed` с пометкой QA сохранён, после reload восстановлен. JSON packet содержит 3 предложения, 1 отзыв, `authority_granted: false` и source IDs.
- Нативное ожидание browser download завершилось таймаутом инструмента. Проверка файла через download API не подтверждена. Добавлен видимый readonly JSON packet для копирования; его содержимое прочитано через DOM и сохранено в `artifacts/insights-review-example.json`. Кнопка Download JSON остаётся доступной для обычного браузера.
- PM-008 открывается до intervention ledger и event refs; invoice остаётся unknown, text mentions не считаются расходом.
- Через file chooser успешно импортирован валидный ledger из 24 синтетических plumbing jobs; выбран источник Imported ledger.
- Agent activity обновляется по мере игры: 17 writes, 0 gate denials, 19 решений воздержаться от действий, 149 683 uncached-input/output token counters; четыре строки с 8/6/4/5 model turns. Live-секция пуста, потому что сервер был в replay mode.
- Mobile 390×844: `documentWidth: 375, viewport: 390`; desktop 1280 и projector viewport 1920 без горизонтального document overflow. Временный viewport override сброшен.
- До проверки offline список console errors/warnings — `[]`.
- Сервер остановлен через Ctrl+C. Reload `/#intelligence` успешно показал dashboard и 595 interventions из service-worker cache.

Скриншоты: `artifacts/intelligence-preview.jpg`, `intelligence-desktop.jpg`, `intelligence-mobile.jpg`. Встроенные данные, lab, UI и review работают без LLM. PDF extraction, real invoice feed, командное хранение отзывов и автоматическая доставка агенту не реализованы; границы и следующий контракт описаны в INTELLIGENCE.md.
