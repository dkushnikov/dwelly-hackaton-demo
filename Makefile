PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)
AGENT_ROOT ?= .deps/lettings-ops-agent
RECORDINGS_ROOT ?= runs/baseline
ARGS ?=
TEST_ARGS ?=

.PHONY: game game-replay test test-agent lint build import-replays import-insights agent-sync agent-update agent-status agent-check
agent-sync:
	$(PYTHON) -m scripts.agent_dependency sync
agent-update:
	$(PYTHON) -m scripts.agent_dependency update
agent-status:
	$(PYTHON) -m scripts.agent_dependency status
agent-check:
	$(PYTHON) -m scripts.agent_dependency check
game: agent-check
	$(PYTHON) -m demo.server --agent-root "$(AGENT_ROOT)" $(ARGS)
game-replay:
	$(PYTHON) -m demo.server --replay $(ARGS)
test:
	$(PYTHON) -m pytest -q -c pyproject.toml tests $(TEST_ARGS)
	node --test tests/*.test.mjs
test-agent: agent-check
	$(PYTHON) -m pytest -q -c pyproject.toml tests --agent-root="$(AGENT_ROOT)" $(TEST_ARGS)
	node --test tests/*.test.mjs
lint:
	$(PYTHON) -m ruff check demo scripts tests
	node --check demo/web/app.js
	node --check demo/web/village.js
	node --check demo/web/model.js
	node --check demo/web/simulation.js
	node --check demo/web/workspace.js
	node --check demo/web/sw.js
	node --check demo/web/insights.js
	node --check demo/web/insights-model.js
build:
	$(PYTHON) -m scripts.build
import-replays:
	$(PYTHON) -m scripts.import_replays "$(AGENT_ROOT)" --recordings-root "$(RECORDINGS_ROOT)"
import-insights:
	$(PYTHON) -m scripts.import_insights "$(AGENT_ROOT)"
