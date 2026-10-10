PYTHON ?= python3
AGENT_ROOT ?= /Users/dkushnikov/Code/lettings-ops-agent
ARGS ?=
TEST_ARGS ?=

.PHONY: game game-replay test lint build import-replays import-insights
game:
	$(PYTHON) -m demo.server --agent-root "$(AGENT_ROOT)" $(ARGS)
game-replay:
	$(PYTHON) -m demo.server --replay $(ARGS)
test:
	$(PYTHON) -m pytest -q -c pyproject.toml tests $(TEST_ARGS)
	node --test tests/*.test.mjs
lint:
	$(PYTHON) -m ruff check demo scripts tests
	node --check demo/web/app.js
	node --check demo/web/village.js
	node --check demo/web/model.js
	node --check demo/web/sw.js
	node --check demo/web/insights.js
	node --check demo/web/insights-model.js
build:
	$(PYTHON) -m scripts.build
import-replays:
	$(PYTHON) -m scripts.import_replays "$(AGENT_ROOT)"
import-insights:
	$(PYTHON) -m scripts.import_insights "$(AGENT_ROOT)"
