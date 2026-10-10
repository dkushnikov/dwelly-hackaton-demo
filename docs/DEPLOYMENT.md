# Подготовка к деплою

## Рекомендуемая схема для сцены

```text
Browser → Cloudflare Access → named Cloudflare Tunnel → Python origin :8787
                                                          ├─ static client
                                                          ├─ /api + SSE
                                                          ├─ mounted agent checkout (read-only)
                                                          └─ persistent runs/demo volume
```

Агент остаётся Python-процессом, поэтому переносить его в Worker и менять runtime не требуется. Отдельный брокер сообщений не нужен: команды идут по HTTP, события — по одному SSE-соединению с keepalive раз в 10 секунд. Для демо достаточно одного origin-процесса. Несколько процессов потребуют общего журнала/очереди и маршрутизации сессий; текущую конфигурацию нельзя масштабировать добавлением uvicorn workers.

## Контейнер с офлайн-показом

```sh
docker compose up --build -d
```

После запуска: `http://127.0.0.1:8787`, проверка `GET /api/health`. Контейнер работает без root, source filesystem read-only, журнал находится в именованном volume `village-runs`. Ключ API не нужен. Образ устанавливает только pinned `uvicorn==0.43.0`; транзитивные зависимости разрешает pip при сборке.

## Контейнер с реальным агентом

Оператор окружения задаёт:

| Переменная | Значение |
|---|---|
| `LETTINGS_AGENT_ROOT` | Необязательный путь к отдельной копии агента; по умолчанию `./.deps/lettings-ops-agent` |
| `ANTHROPIC_API_KEY` | Передаётся секрет-хранилищем процессу, не браузеру |
| `VILLAGE_PUBLIC_ORIGIN` | Точный URL, например `https://village.your-domain.example` |
| `LOA_MODEL` | Доступная вашему аккаунту модель; иначе default из агента |
| `LOA_EFFORT`, `LOA_MAX_STEPS`, `LOA_CASE_TIMEOUT_S` | Необязательные настройки существующего harness |

```sh
make agent-sync
make test-agent
docker compose -f compose.yaml -f deploy/compose.live.yaml up --build -d
```

Отдельная копия из `.deps` закреплена в `agent-source.json` и монтируется read-only в `/agent`; исходный рабочий каталог команды не используется. Код приложения читает только agent modules, rulebook, playbooks, world YAML и fixtures. Не загружать секреты в образ, не копировать `.env` и не передавать их через URL. `.dockerignore` допускает только исходники demo и pyproject.

Healthcheck должен обращаться с тем же Host, что и `VILLAGE_PUBLIC_ORIGIN`. Локальная curl-проверка при внешнем origin:

```sh
curl -f -H 'Host: village.your-domain.example' http://127.0.0.1:8787/api/health
```

## Cloudflare Tunnel

1. В своём аккаунте Cloudflare создать **named tunnel** через dashboard, выбрать машину с запущенным origin и установить официальный `cloudflared` connector. Следовать текущей [инструкции Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/).
2. Назначить hostname, например `village.your-domain.example`, сервис `http://localhost:8787`. Если connector в другом контейнере, использовать доступный ему origin-адрес и закрытую Docker-сеть.
3. Защитить **весь hostname**, включая `/api/*`, Cloudflare Access для аккаунтов ведущих. Доступ к live API позволяет расходовать LLM-бюджет и видеть все тестовые сессии этой команды.
4. Передать точный hostname/схему в `VILLAGE_PUBLIC_ORIGIN`. Не включать кеширование или преобразование `/api/*`; SSE имеет `Cache-Control: no-cache, no-transform`.
5. Проверить начало заявки, получение live trace, паузу для человека и reconnect. Экспортировать успешную сессию до выступления.

Для публикации replay-origin вместо live-origin задать Compose command `python -m demo.server --host 0.0.0.0 --replay --public-origin https://village.your-domain.example`. Обновить healthcheck Host аналогично live-конфигурации.

Секрет tunnel хранится и вводится владельцем окружения средствами Cloudflare. Для текущего подготовительного этапа доступы не нужны. Не использовать временный незащищённый tunnel как публичный доступ к live API.

## Cloudflare Pages: отдельная автономная копия

```sh
make build
npx wrangler pages deploy dist --project-name lettings-village
```

Команда публикации приведена для оператора аккаунта и **не выполнялась**. Wrangler устанавливается/запускается из официального npm-пакета и запрашивает авторизацию отдельно. Конфигурация build — `wrangler.jsonc`, security headers копируются в `dist/_headers`.

Pages-версия показывает записанные решения. В ней нет Python API, нельзя запускать live-модель или отвечать за участника. При открытии UI сам определяет отсутствие API. Можно держать её как независимую запасную ссылку.

В тот же build входит вкладка Intelligence: корпус, лабораторный портфель, расчёты и review UI. Она работает без сервера и API. Импортированный ledger остаётся в памяти страницы, отзывы — в localStorage конкретного origin; для передачи команде используется явный экспорт JSON. D1, Worker API, командная авторизация и автоматическая доставка feedback пока не подключены. Не добавлять приватные импортированные ledgers или live-журналы в публичный `demo/web`.

## Перед показом

- Заранее открыть localhost/Pages и дождаться «Offline village available on this device».
- Проверить `?replay=fraud&presenter=1`, масштаб 1×/2×/4×, проигрывание до финального handover.
- При live-показе ограничить доступ к origin, проверить доступность модели и установить разумные таймауты/число раундов.
- Скачать JSONL live-сессии. Проверить её через кнопку Replay: импорт делает ноль API-вызовов.
- Оставить локальный `make game-replay` готовым: так отказ Wi-Fi не зависит даже от кеша браузера.

Docker и cloudflared не установлены в среде этой сборки. Конфигурация проверена статически; контейнерный build, DNS, TLS, Cloudflare Access и внешний SSE требуют smoke-test в целевом аккаунте.
