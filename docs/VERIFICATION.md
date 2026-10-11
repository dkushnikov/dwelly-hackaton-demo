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

## Isolated agent dependency and English README — 2026-10-10

The demo now owns `.deps/lettings-ops-agent` and `.venv`; it no longer uses the agent team's source checkout or Python environment. `agent-source.json` pins the GitHub revision. The single maintained README is fully English. The dependency workflow is documented in `AGENT_DEPENDENCY.md`.

Commands exercised:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check --no-cache-dir '.[live,dev]'
make agent-sync
make agent-update
make agent-status
make test-agent
make lint
```

Installation completed successfully in the demo's own environment. The initial clone pinned `a2c80f58a7f82341f9677f26c2c13e1b139c7307`; the real update fetched the newer upstream main revision. Final status and repeated sync output:

```text
Upstream: https://github.com/dkushnikov/lettings-ops-agent.git (main)
Pinned revision: 9103fab85f371982ee68e88ac75f96e0ff662447
Local revision: 9103fab85f371982ee68e88ac75f96e0ff662447
Agent checkout: /Users/dkushnikov/Documents/ChatGPT/Dwelly Hackathon Demo/.deps/lettings-ops-agent
Revision: 9103fab85f371982ee68e88ac75f96e0ff662447 (unchanged)
Pinned source is ready. Restart live sessions after an update; run make test-agent before using it.
```

Final tests against that exact copied revision (individual test names omitted):

```text
54 passed in 3.31s
node --test tests/*.test.mjs
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 50.82025
All checks passed!
```

The 14 added Python cases exercise pinned sync, independent source changes, forward updates, dirty and untracked file refusal, origin mismatch, symlink/shared-worktree refusal, divergent history, missing runtime files, ignored file collisions, invalid configuration and missing replay artifacts. The real bridge tests use the copied harness with a scripted provider and make no paid LLM calls.

One new test initially failed: Git sparse checkout overwrote an ignored file despite `switch --no-overwrite-ignore`. The dependency manager now compares ignored paths with the target tree before switching. The regression test confirms that both the local file and revision pin remain unchanged when a collision is rejected.

The first sandboxed `make agent-sync` and `make agent-update` could not resolve `github.com`; the first sandboxed pip install could not resolve `pypi.org`. Repeating with approved network access succeeded. No credentials or source-team uncommitted artifacts were copied.

Additional read-only checks returned:

```text
English README check: 1 maintained file(s)
Live Compose YAML: isolated read-only mount, missing source rejected
```

`git diff --check` passed, and `git check-ignore .deps/lettings-ops-agent/harness/loop.py` confirmed that the clone is excluded from demo commits. Compose was inspected as YAML; the Docker runtime and a paid live episode remain unverified. Bundled replay/BI data was preserved, and no deployment was performed for this migration.

## Interactive public-case simulations — 2026-10-10

Added complete simulations for public Property Management PM-021 (lock and key replacement), PM-017 (extractor switch, no visit/payment), and PM-025 (manufacturer warranty repair). The public corpus files were read from the supplied checkout; none of the six source Markdown files had local Git modifications. The bundle records revision `9bcdca585955dfb930005ed742572606e68f5688`, hashes and exact event references. Existing real-agent recordings were preserved.

```sh
.venv/bin/python -m scripts.import_scenarios /Users/dkushnikov/Code/HackatonPublicCases
make test-agent
make lint
make build
```

```text
public-scenarios.json: 3 public cases with source revision, hashes and event evidence
60 passed in 4.39s
ℹ tests 22
ℹ suites 0
ℹ pass 22
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 53.95425
All checks passed!
Interactive simulation: 3 source-linked public cases, role control and browser-local saved sessions; no API calls.
```

An archive inspection confirmed 23 allowlisted static files, including `simulation.js` and `public-scenarios.json`, with no dependency checkout, Python environment or runtime journals. JavaScript syntax was checked again after the final focus-preservation change. That change prevents another case's pending turn from interrupting an already pending player turn.

The added JavaScript tests cover all public success paths, evidence references, no LLM usage, approval refusal, stale/wrong-role/unknown-choice rejection, all four manual roles, pending-turn restoration, exactly one dispatch, incomplete work/final-check rejection, cancellation, unresolved safety handover, fraud blocking, case filters and separation of simulations from real-agent BI. Python checks cover the role-map API contract and sequential landlord/tenant manual turns in the real pinned agent harness using a scripted provider.

Browser verification in the existing in-app tab:

- **Start the village**, 4×: all three public cases and the fraud incident visibly reached successful completion; source cases closed with 6/6, 3/3 and 8/8 checks respectively.
- **Cases** lists and filters active, waiting and successful sessions. Searching `PM-` with Success selected returns exactly the three public cases.
- A new free-form repair was run with **Play everyone**. Declining approval left it waiting for the landlord, with no dispatch. Reload restored that exact human barrier.
- Continuing that case handed control to landlord, contractor, tenant, contractor, tenant and operator in order. A work order appeared only after access consent; the final review produced Success.
- PM-021's evidence dialog exposes the original public repository link, revision, source property, six event references and history hash.
- BI lists five interactive simulations separately, with 12 simulated actions, one simulated denial, zero model calls and zero tokens. Live and recorded populations remain empty for this browser session.
- Mobile 390×844: document width 375, dialog width 341; no horizontal overflow. Viewport override was reset.
- Console errors/warnings before the offline check: `[]`.
- Preview server was stopped, then the page reloaded successfully from its service-worker cache with all five saved cases intact.

Screenshot: `artifacts/interactive-cases.jpg`. These are explicitly scripted simulations, not claims that a paid LLM passed the public cases. No paid model calls, deployment, shared multi-user queue or automatic agent learning were added. Live configuration uses the new role map; a complete real-provider episode remains unverified.

## Upstream agent refresh — 2026-10-10

`make agent-update` advanced the isolated checkout and `agent-source.json` from `9103fab85f371982ee68e88ac75f96e0ff662447` to `475337052375be88e5b6c8eafa5ec4f709042133`, the fetched upstream `main`. The source team's checkout was not modified. This update adds emergency make-safe authority, a document safety review before resolution, run provenance, a runs board and simulator fixes. No demo adapter changes were needed for compatibility.

Commands and actual results:

```sh
make test-agent
make lint
make build
```

```text
60 passed in 3.75s
ℹ tests 22
ℹ suites 0
ℹ pass 22
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 53.6205
All checks passed!
Static replay build: /Users/dkushnikov/Documents/ChatGPT/Dwelly Hackathon Demo/dist
4 authentic recordings; no runtime sessions, agent source, credentials, CDN or API dependency.
Interactive simulation: 3 source-linked public cases, role control and browser-local saved sessions; no API calls.
BI: 50 public corpus cases + 84 clearly labelled synthetic portfolio jobs; local review feedback.
Deployment archive: /Users/dkushnikov/Documents/ChatGPT/Dwelly Hackathon Demo/artifacts/lettings-village-static.zip (119790 bytes)
```

The upstream regression suite was also run against the unchanged pinned source. Its tracked `tests/` and `fixtures-dwelly/` directories were materialized in the managed sparse checkout using Git's CLI, with the existing sensitive-file and agent-instruction exclusions retained. This extra local test material is ignored by the demo repository. The demo's own `.venv` received `pytest-asyncio==1.4.0` and `pypdf==6.20.0` for upstream async tests and PDF fixtures; these are test-run setup, not new demo runtime requirements.

From `.deps/lettings-ops-agent`:

```sh
../../.venv/bin/python -m pytest -q -c pyproject.toml tests
```

```text
........................................................................ [ 60%]
...............................................                          [100%]
119 passed in 5.11s
```

The initial sandboxed update and lazy fetch of upstream test blobs failed with `Could not resolve host: github.com`. Retrying with approved network access succeeded. The upstream suite and demo bridge tests use scripted providers; paid LLM behavior and a deployed live episode remain unverified.

## Assign participants within the case — 2026-10-10

Removed contractor/operator identity selectors from new-case setup. Role controls remain independent. New simulations route an operator at intake and assign a contractor by trade when the case reaches provider selection. Assignment is an auditable event, separate from dispatch. PM-017 closes without a contractor. Existing saved casts are preserved.

```sh
node --test tests/*.test.mjs
make lint
make build
.venv/bin/python -m pytest -q -c pyproject.toml tests --agent-root=.deps/lettings-ops-agent
```

```text
ℹ tests 27
ℹ pass 27
ℹ fail 0
All checks passed!
Deployment archive: /Users/dkushnikov/Documents/ChatGPT/Dwelly Hackathon Demo/artifacts/lettings-village-static.zip (120481 bytes)
60 passed in 3.35s
```

Regression checks cover no contractor assignment/turn in PM-017, approval refusal before selection, trade and operator routing, manual control of the chosen provider, immutable intake history, export/replay of assignments, restoration before/after assignment, legacy casts and invalid imported assignment events.

Browser checks on `127.0.0.1:8787`: nine existing sessions restored; new PM-017 with the contractor set to **You** reached Success and displayed **Contractor: not involved**. In a new PM-021, the landlord's manual approval preceded selection of SecureFast Locksmiths; its manual provider turn survived reload. Completing its provider and completion turns reached Success. Console warnings/errors: `[]`. The updated launch form was left open. Screenshot: `artifacts/automatic-participant-routing.png`.

## People filters, Homes, reset/undo and Replay chooser — 2026-10-10

```sh
make test-agent
node --test tests/*.test.mjs
make lint
make build
git diff --check
```

```text
63 passed in 3.68s
ℹ tests 34
ℹ pass 34
ℹ fail 0
All checks passed!
Deployment archive: /Users/dkushnikov/Documents/ChatGPT/Dwelly Hackathon Demo/artifacts/lettings-village-static.zip (126951 bytes)
```

The first directory test exposed an ambiguous expectation: unquoted `richmond road` also matches `Kew Road, Richmond`. Search now supports quoted phrases; tests distinguish the two-word search from the exact `"Richmond Road"` phrase. The final JavaScript run passed all 34 tests. Python checks include same-origin/confirmation requirements, cancellation of a pending live turn, journal preservation, reset notification and preservation of sessions created concurrently with cancellation. Storage tests cover scoped clearing, persistent undo, restoration of a pending simulation, BI reviews, quota failure before clearing, rollback after partial removal and rejection of foreign storage keys.

Browser reset tests used a separate origin, `127.0.0.1:8788`, leaving the user's existing `8787` sessions intact:

- Homes search `sarah p-004` selected one property; Report issue preselected P-004.
- People combined Home P-004, You and `sarah` into one result. Contractor + `plumber` returned two providers. Same-name tenants remained distinct by home.
- Replay first displayed instructions, four built-in recordings and an explicit file button. An invalid JSONL uploaded through the system file chooser produced an inline error; the file chooser tool was unusually slow but completed. A built-in recorded run started successfully.
- Sessions-only reset cleared a pending manual simulation and a replay. After reload the board was empty and Undo remained available. Undo restored both cases and the exact landlord prompt, paused.
- Full reset cleared a test BI review and settings. Undo restored the snoozed review and the applied £45/hour rate. The browser tool's initial programmatic fill did not commit the rate; keyboard input and the resulting £45/h KPI were verified before the reset/undo assertion.
- At 390×844, document width was 375 and People dialog width was 358: no horizontal overflow. The viewport override was reset.
- Console warnings/errors: `[]`. The test tab and port 8788 server were closed. The original tab was refreshed and opened on Homes; its eleven prior simulations remained available.

Screenshots: `artifacts/homes-directory.png`, `artifacts/people-filters.png`. Lint and the deployment archive were rebuilt after the final label/error-display polish. No live paid-provider episode or deployment was performed.

## House signals, directory landmarks and expanded map — 2026-10-10

```sh
node --test tests/*.test.mjs
make lint
make build
git diff --check
```

```text
ℹ tests 37
ℹ pass 37
ℹ fail 0
All checks passed!
Deployment archive: /Users/dkushnikov/Documents/ChatGPT/Dwelly Hackathon Demo/artifacts/lettings-village-static.zip (129445 bytes)
```

Three new tests cover home isolation, multiple cases, empty/active/success/finished states, manual-turn and review priority, recorded prompts and cancellation without fabricated success. No backend changes were needed in this iteration; the previously recorded Python results remain the latest backend verification.

Browser checks used an isolated origin, `127.0.0.1:8789`, after the initial landlord shortcut check on the user's tab. Landlords selected four people; Contractors selected seven. Starting the fixed pack produced exactly four sessions: two at P-001, one at P-002 and one at P-006. Other homes displayed No cases. A separate manual PM-017 produced Your turn at P-002 even with another case at that home. Completed automatic cases changed their signals to success.

The expanded map rendered at a 3072-pixel backing width; native text overlays stayed readable, and Escape/the exit control restored the workspace. People dialogs worked above the expanded map. At a 390×844 viewport, document width was 390 and status labels stayed inside the viewport; the override was reset. Browser console warnings/errors: `[]`. Fullscreen availability depends on the browser; the viewport-filling fallback uses the same map layout. Screenshot: `artifacts/village-fullscreen.png`.

## Public case interface review — 2026-10-10

The read-only corpus at revision `9bcdca585955dfb930005ed742572606e68f5688` contains 50 cases, 1,505 events and 16 PDFs. All index statuses are Completed. Event channels: Email 506, Call 74, SMS 54, Note 192, Update 443, Hold 236. The review uses each overview/outcome plus selected substantive journal events, extracts PDF text with `pdftotext -layout`, and visually checks PM-020 report page 4 and the PM-007 tax invoice with `pdftoppm`.

`docs/CASE_REVIEW.md` has 50 individually numbered reviews, a ranked backlog, acceptance criteria, scenario priorities and a proposed agent/UI data contract. A local validation script confirmed all 50 unique case headings in order and all 67 source file references exist. Findings include PM-020 report/email disagreement, PM-007 quote/invoice difference, PM-032 overview/history amount disagreement and PM-050 alternative quotes plus a conflicting later amount. These are source-data inconsistencies, not measured agent failures. No run of the agent across these 50 cases was performed.

## Public onboarding and release verification — 2026-10-10

README now includes a clone-to-launch sequence, a direct upstream agent link, runtime/test prerequisites, isolated live setup, static preview and hosting choices. The deployment guide documents Pages Git integration and the separate same-origin Docker/Tunnel deployment. All 67 case-review references now use the pinned public corpus revision on GitHub.

Commands and observed results:

```text
make test-agent
63 passed in 3.40s
ℹ tests 37
ℹ pass 37
ℹ fail 0

make lint
All checks passed!
```

All eight frontend JavaScript syntax checks also completed successfully. The dependency check confirmed both pinned and local agent revisions are `475337052375be88e5b6c8eafa5ec4f709042133`; no agent update was made for this release.

```text
make build
Interactive simulation: 3 source-linked public cases, role control and browser-local saved sessions; no API calls.
BI: 50 public corpus cases + 84 clearly labelled synthetic portfolio jobs; local review feedback.
Deployment archive: /Users/dkushnikov/Documents/ChatGPT/Dwelly Hackathon Demo/artifacts/lettings-village-static.zip (129445 bytes)

git diff --check
(no output; exit 0)
```

A fresh virtual environment was created inside ignored `artifacts/readme-smoke` using Python 3.14.7. It installed only the package's base dependencies, then ran the installed package from that directory, outside the source import path:

```sh
.venv/bin/python -m venv artifacts/readme-smoke/.venv
artifacts/readme-smoke/.venv/bin/python -m pip install --no-cache-dir .
# From artifacts/readme-smoke:
.venv/bin/python -m demo.server --replay --port 8789 --runs runs
```

```text
Successfully installed click-8.5.0 h11-0.16.0 lettings-village-0.1.0 uvicorn-0.43.0
Lettings Village → http://127.0.0.1:8789 · simulation + recorded runs / no API calls
Clean-install health: {"ok": true, "live": false, "protocol": 1, "message": "Simulation and replay · no API calls", "max_sessions": 32}
Clean-install HTTP smoke: 10 routes return 200; assets match working source
```

The HTTP smoke check covered the index, app, workspace, simulator, catalog, public scenarios, both BI datasets, fraud recording and service worker. No agent checkout or provider credential was used by this replay server. The temporary server was stopped after the check; the user's main port 8787 server was left running.

Documentation/archive validation:

```text
README.md: English text; 15 local links resolve
docs/DEPLOYMENT.md: English text; 2 local links resolve
CASE_REVIEW.md: 67 pinned, portable source URLs; no local paths
Static output: 24 files match the deployment archive; no extra files
```

Initial sandboxed commands could not resolve `github.com` (`git ls-remote origin refs/heads/main`) or `pypi.org` (`artifacts/readme-smoke/.venv/bin/python -m pip install .`). The fresh server also initially failed to bind localhost with `[Errno 1] operation not permitted`. Network installation, remote verification and localhost checks succeeded after tool-level sandbox escalation. No credentials were read or copied.

These checks do not verify a paid model episode or a deployed Cloudflare/container environment. The advertised minimum Python version is 3.12; this fresh-install check used the available Python 3.14.7 runtime.

## Cloudflare preparation and Case Review iteration — 10 October 2026

The isolated upstream pin advanced from `475337052375be88e5b6c8eafa5ec4f709042133` to `b0ef66d4d0dd58ab1499071fe580a18b8e9ce1c0`. The original sibling repository was not modified. The initial update approval was rejected because the reviewer classified `.deps` as a sibling; resolved-path checks proved it was inside this workspace and not a symlink, and the bounded update then succeeded.

```text
make test-agent
68 passed in 3.62s
JavaScript: tests 53; pass 53; fail 0

make lint
All checks passed!

node deploy/cloudflare/smoke.mjs
Cloud gateway smoke: PASS (login, asset/API protection, CSRF, budget concurrency, settlement idempotency, durable replay, logout). No model calls.

make build
Deployment archive: lettings-village-static.zip (136955 bytes)

git diff --check
[exit 0]
```

The smoke test uses Cloudflare workerd with SQLite, synthetic credentials and a mock assets service. It verifies 20 concurrent reservations cannot exceed the $5 ledger, duplicate settlements cannot refund twice, and both budget and a journal survive runtime restart. It does not start a real container or contact Anthropic. Its first localhost launch failed with `listen EPERM: operation not permitted 127.0.0.1`; the approved local-port run passed.

Case Review browser QA used an isolated server on port 8789: PM-017 manual evidence request → Missing evidence filter → reload with preserved turn → Working after advice / Closed with checks / Closed without payment. Browser console errors: `[]`. A replay's recorded prompt no longer counts as a current human turn. The test server and tab were closed afterwards.

Full deployment dry run remains unverified: `npx wrangler deploy --config wrangler.live.jsonc --dry-run --outdir artifacts/cloudflare-worker` first encountered `EPERM` for Wrangler's default global log directory. Routing Wrangler config/logs into workspace artifacts resolved that filesystem issue; the command then failed because **the Docker CLI is not installed**. Cloudflare Workers Builds is the intended image-build environment. No deployed Container, external SSE or paid provider call had been confirmed at the time of this preparation record; the following checkpoint updates deployment status.

## Deployment and saved checkpoint — 11 October 2026

Cloudflare Workers Builds succeeded for application source
`3d25272d39e001f01309692c21b4e960140c1586`, build
`c7a8ceee-016b-44ed-882b-6141c089537d` (2m 9s). The first build failed because
Wrangler's normalised Dockerfile used the root ignore file and excluded
`agent-source.json` and `scripts/agent_dependency.py`. Commit `3d25272` corrected
that allowlist; the subsequent image build and deployment succeeded.

The hosted `/login` page at `lettings-village.dkushnikov.workers.dev` was observed
in the browser after the owner provisioned the runtime secrets. No secret values
were read. A later sandboxed public HTTP check could not resolve the hostname:

```text
curl --silent --show-error --max-time 20 --output /dev/null --write-out 'home: %{http_code} %{redirect_url}\n' https://lettings-village.dkushnikov.workers.dev/
curl: (6) Could not resolve host: lettings-village.dkushnikov.workers.dev
home: 000
```

Browser navigation succeeded independently. A paid deployed provider episode,
external SSE/manual turn and post-shutdown cloud recording remain unverified.
Those checks and further features were explicitly deferred by the owner.

Checkpoint maintenance adds current state/resume, forking, roadmap and agent
feedback documents; replaces the obsolete initial plan/handoff; adds Apache-2.0
for original code and preserves corpus/artwork exceptions. Static and Docker
distributions now include the required license/notice inputs. This packaging
change has not been rebuilt on Cloudflare. No behaviour of the agent was changed.

Fresh checks in the existing environment (Python 3.14.7, Node 26.8.2, npm 11.19.1):

```text
make test-agent
Pinned revision: b0ef66d4d0dd58ab1499071fe580a18b8e9ce1c0
Local revision: b0ef66d4d0dd58ab1499071fe580a18b8e9ce1c0
68 passed in 3.82s
ℹ tests 53
ℹ pass 53
ℹ fail 0

make lint
All checks passed!
[all nine JavaScript syntax commands exited 0]

.venv/bin/python -m pip check
No broken requirements found.

make build
4 authentic recordings; no runtime sessions, agent source, credentials, CDN or API dependency.
Interactive simulation: 3 source-linked public cases, role control and browser-local saved sessions; no API calls.
BI: 50 public corpus cases + 84 clearly labelled synthetic portfolio jobs; local review feedback.
Deployment archive: lettings-village-static.zip (141258 bytes)

Checkpoint file validation
Static archive: 26 files match dist; license and notices included.
Markdown: 71 local links resolve.
Manifest: 72 checksums match.
Package metadata and Docker license inputs: PASS.
```

`pip check` also reported its normal unwritable global cache warning; no cache or
permission changes were made. Dependency constraints were captured from installed
package metadata (29 packages, excluding pip and this project). They are a record
of the tested environment, not proof of a fresh install or Python 3.12 compatibility.
No new dependencies were installed or network/provider calls made for this freeze.

Cleanup removed only generated `build/`, `dist/`, pytest/ruff caches, root egg-info
and Python bytecode under demo/scripts/tests. Source, bundled evidence, journals,
test artifacts and local environments were preserved. The static ZIP remains an
ignored local artifact; `make build` recreates `dist/`. The manifest and this
record are portable source records, not backups of runtime or cloud data.

Cloud smoke was not repeated because gateway/runtime logic did not change; its
previous successful result is recorded above. No cloud resource was changed or
deleted, and no paid provider call was made. Git commit/tag/publication status is
deliberately not inferred from the existence of these checkpoint files.
