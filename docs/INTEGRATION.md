# API и подключение агентного стрима

## Существующий агент

`make game` использует отдельную копию `.deps/lettings-ops-agent`, закреплённую в `agent-source.json`; `make agent-sync` воспроизводит её, `make agent-update` явно обновляет из upstream. `demo.engine.AgentEngine` получает этот путь через `--agent-root`. На старте загружает реальные `harness.loop.CaseAgent`, `Rulebook`, `PlaybookLibrary`, `Settings` и `mockworld.adapter.MockAdapter`. Исходный рабочий каталог агентной команды не используется.

В сессии Case.id остаётся неизменным между раундами: `MockAdapter.world_for(case)` возвращает тот же мир. Между сессиями adapter отдельный. Trace callback получает `model_turn`, `playbook`, `gate`, `tool_result`, `terminal`, а world.log даёт подтверждённые effects. `finally` вычитывает остаток лога даже при ошибке ответа агента.

Ответы участников добавляются как `Artefact(kind="email", trust="untrusted")` с ролью, свойством, временем и исходным текстом. Решение предыдущего раунда и receipts — informational artefacts. Только запись выбранного property — authoritative. Human reply не меняет spend cap и не создаёт approval в обход модели/gate.

Для другого backend сохранять тот же event contract и методы API ниже. Потребуется заменить драйвер `engine.py`, не переписывать renderer.

## Endpoint contract

| Endpoint | Назначение |
|---|---|
| `GET /api/health` | `{ok, live, protocol, max_sessions}` |
| `POST /api/sessions` | Создать live-сессию, вернуть `{id}` |
| `GET /api/sessions` | Snapshot с текущим bus cursor и событиями доступных сессий |
| `GET /api/events?after=<cursor>` | Один SSE-поток всех тикетов |
| `POST /api/sessions/<id>/message` | Ответ на ожидающий player turn |
| `POST /api/sessions/<id>/cancel` | Прервать run и записать episode_end |
| `POST /api/reset` | With `{confirm: true}`, stop and clear current live sessions, retain journals, and broadcast their IDs to connected viewers |
| `GET /api/sessions/<id>/recording` | JSONL, доступен и после перезапуска |

Создание:

```json
{"scenario":"free","property":"P-005","issue":"Boiler not working, I'm 82 and cold","role":"tenant","director":"scripted","max_ticks":4}
```

`scenario`: routine, approval, fraud, vulnerable, free. Для fixture-сценариев issue пустой — входные артефакты загружаются из fixtures, а не из придуманных описаний. `role`: watch, tenant, landlord, contractor, operator. `director`: scripted или improvise. Лимит — 32 активные/сохранённые в памяти сессии; при необходимости вытесняется только завершённая, журнал сохраняется.

Ответ игрока:

```json
{"role":"landlord","prompt_id":"id-from-awaiting-player","body":"I decline the quote. Please obtain another one."}
```

Роль и одноразовый prompt_id должны совпасть. Повторный или запоздалый ответ отвергается. Таймаут ожидания — 15 минут.

## События v1

Общие поля: `v=1`, `session`, `seq` (монотонный внутри тикета), `tick`, `sim_time`, `at_ms`. SSE добавляет глобальный `cursor`; он не является порядком внутри чужого тикета. Клиент дедуплицирует `(session, seq)`. Reconnect поддерживает `Last-Event-ID`; при истечении буфера сервер отправляет `event: reset`, клиент получает новый snapshot.

Типы: `ticket_opened`, `actor_message`, `queued`, `agent_thinking`, `playbook`, `gate`, `tool_result`, `effect`, `status`, `awaiting_player`, `time_passes`, `withheld`, `episode_end`, `error`. Служебные trace-типы terminal/nudge/reconciled/time_nudge и usage директора тоже сохраняются.

`gate` содержит точный verdict/rules/reason. `tool_result` не означает выполненную запись. `effect` возникает из world.log, а при импорте исторического run — только из ActionRecord с `tool_class=write` и `status=completed`. Refusal из `withheld_actions` никогда не преобразуется в deny.

`status` передаёт stage, hold_reason, recap, next_step, dod, red_flags, handover, disposition и usage. Ответственный: hold reason → landlord/provider/tenant; при эскалации → operator; затем субъект next_step; иначе agency. `resolved` описывает решение конкретного раунда, поэтому не объявляет ремонт закрытым. Episode завершается по stage `closed*`, лимиту раундов, ошибке или команде Stop.

## Ограничения эксплуатации

Хранилище живых миров — память одного процесса. Журнал append-only, запись выполняется до broadcast, но не делает fsync на каждое событие. Это защита от обрыва соединения/обычного рестарта, не гарантия сохранения последнего события при потере питания.

SSE буфер — 20 000 событий. Истёкший cursor восстанавливается через snapshot. Исторические завершённые сессии, вытесненные из памяти, доступны только как JSONL. После рестарта нельзя продолжить живой мир из лога.

API использует same-origin JSON writes, Host allowlist, ограничения размера/числа ходов и path confinement. В варианте Tunnel авторизация делегируется Cloudflare Access. Workers + Containers использует password gateway: см. [CLOUDFLARE.md](CLOUDFLARE.md). Индивидуальных аккаунтов нет.


## Interactive controls and browser simulation

`POST /api/sessions` accepts an optional complete `controls` object with keys
`tenant`, `landlord`, `contractor`, `operator`; each value is `ai` or `human`.
Explicit controls take precedence over the legacy single `role`. When omitted,
the selected legacy role and the operator are human-controlled. The assignments
are included in `ticket_opened` and reconnect snapshots. All live participant
replies remain untrusted agent evidence.

Browser simulations are independent of the live API. `simulation.js` emits
protocol v1 events with `simulated: true`, named participants, explicit choices,
source event references and `episode_end.outcome`. Their state and journals live
in browser local storage. The Cases view and BI keep these separate from live
and recorded agent output. See [INTERACTIVE.md](INTERACTIVE.md).
