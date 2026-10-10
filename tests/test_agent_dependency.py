"""Exercise dependency updates against disposable local Git repositories."""

import json

import pytest

from scripts.agent_dependency import REQUIRED, git, inspect_checkout, load_source, sync
from scripts.import_replays import convert


def commit(repo, message):
    git("add", "--all", cwd=repo)
    git("-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
        "-c", "user.name=Dependency tests", "-c", "user.email=tests@example.invalid",
        "commit", "-m", message, cwd=repo)
    return git("rev-parse", "HEAD", cwd=repo).stdout.strip()


@pytest.fixture
def dependency(tmp_path):
    upstream = tmp_path / "upstream"
    git("init", "--initial-branch=main", str(upstream))
    for name in REQUIRED:
        path = upstream / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("initial fixture\n")
    (upstream / ".gitignore").write_text("data/generated.json\n")
    source = {"repository": str(upstream), "branch": "main", "revision": commit(upstream, "Initial runtime")}
    checkout = tmp_path / "demo" / ".deps" / "agent"
    lock = tmp_path / "agent-source.json"
    lock.write_text(json.dumps(source))
    return upstream, source, checkout, lock


def test_sync_pins_old_revision_and_update_advances_only_the_copy(dependency):
    upstream, source, checkout, lock = dependency
    (upstream / "harness/loop.py").write_text("updated fixture\n")
    latest = commit(upstream, "Update runtime")
    # The source team's uncommitted work must never enter the demo's copy.
    (upstream / "harness/loop.py").write_text("uncommitted source work\n")
    assert sync(source, checkout) == source["revision"]
    assert (checkout / "harness/loop.py").read_text() == "initial fixture\n"
    assert sync(source, checkout) == source["revision"]
    assert git("symbolic-ref", "-q", "HEAD", cwd=checkout, check=False).returncode == 1
    assert sync(source, checkout, update=True, lock_path=lock) == latest
    updated = json.loads(lock.read_text())
    assert updated == {**source, "revision": latest}
    assert inspect_checkout(checkout, updated) == latest
    assert (checkout / "harness/loop.py").read_text() == "updated fixture\n"
    assert (upstream / "harness/loop.py").read_text() == "uncommitted source work\n"
    assert git("branch", "--show-current", cwd=upstream).stdout.strip() == "main"


@pytest.mark.parametrize("path", ["harness/loop.py", "harness/local-notes.txt"])
def test_dirty_dependency_refuses_sync_without_losing_work(dependency, path):
    _, source, checkout, lock = dependency
    sync(source, checkout)
    original_lock = lock.read_text()
    (checkout / path).write_text("preserve this work\n")
    with pytest.raises(ValueError, match="local edits or untracked"):
        sync(source, checkout, update=True, lock_path=lock)
    assert (checkout / path).read_text() == "preserve this work\n"
    assert lock.read_text() == original_lock
    assert git("rev-parse", "HEAD", cwd=checkout).stdout.strip() == source["revision"]


def test_refuses_an_origin_mismatch(dependency):
    _, source, checkout, _ = dependency
    sync(source, checkout)
    with pytest.raises(ValueError, match="origin differs"):
        sync({**source, "repository": source["repository"] + "-other"}, checkout)


def test_refuses_symlink_and_shared_worktree(dependency, tmp_path):
    upstream, source, _, _ = dependency
    alias = tmp_path / "alias"
    alias.symlink_to(upstream, target_is_directory=True)
    with pytest.raises(ValueError, match="not a symlink"):
        inspect_checkout(alias, source)
    worktree = tmp_path / "shared-worktree"
    git("worktree", "add", "--detach", str(worktree), source["revision"], cwd=upstream)
    with pytest.raises(ValueError, match="shares Git metadata"):
        inspect_checkout(worktree, source)


def test_update_refuses_divergent_history_and_preserves_pin(dependency):
    upstream, source, checkout, lock = dependency
    git("switch", "-c", "feature", cwd=upstream)
    (upstream / "harness/loop.py").write_text("feature fixture\n")
    source = {**source, "revision": commit(upstream, "Feature runtime")}
    lock.write_text(json.dumps(source))
    git("switch", "main", cwd=upstream)
    (upstream / "harness/loop.py").write_text("main fixture\n")
    commit(upstream, "Main runtime")
    sync(source, checkout)
    with pytest.raises(ValueError, match="not a fast-forward"):
        sync(source, checkout, update=True, lock_path=lock)
    assert json.loads(lock.read_text()) == source
    assert inspect_checkout(checkout, source) == source["revision"]


def test_missing_runtime_refuses_update_before_switching(dependency):
    upstream, source, checkout, lock = dependency
    sync(source, checkout)
    (upstream / "harness/loop.py").unlink()
    commit(upstream, "Remove runtime contract")
    with pytest.raises(ValueError, match="lacks harness/loop.py"):
        sync(source, checkout, update=True, lock_path=lock)
    assert json.loads(lock.read_text()) == source
    assert inspect_checkout(checkout, source) == source["revision"]


def test_update_does_not_overwrite_a_conflicting_ignored_file(dependency):
    upstream, source, checkout, lock = dependency
    sync(source, checkout)
    (checkout / "data").mkdir()
    local = checkout / "data/generated.json"
    local.write_text("local result\n")
    (upstream / "data").mkdir()
    (upstream / "data/generated.json").write_text("new upstream data\n")
    git("add", "--force", "data/generated.json", cwd=upstream)
    commit(upstream, "Track new data")
    with pytest.raises(ValueError, match="ignored files that conflict"):
        sync(source, checkout, update=True, lock_path=lock)
    assert local.read_text() == "local result\n"
    assert json.loads(lock.read_text()) == source
    assert inspect_checkout(checkout, source) == source["revision"]


@pytest.mark.parametrize("override", [
    {"revision": "main"}, {"revision": 123}, {"repository": None},
    {"repository": "https://example.com/owner/agent.git"}, {"branch": "--all"},
])
def test_source_validation_rejects_invalid_config(tmp_path, override):
    path = tmp_path / "agent-source.json"
    source = {"repository": "https://github.com/owner/agent.git", "branch": "main", "revision": "a" * 40}
    path.write_text(json.dumps(source | override))
    with pytest.raises(ValueError):
        load_source(path)


def test_missing_baseline_artifacts_leave_bundled_replays_untouched(tmp_path):
    output = tmp_path / "replays"
    output.mkdir()
    bundled = output / "fraud.jsonl"
    bundled.write_text("existing recording\n")
    with pytest.raises(ValueError, match="Bundled replays remain unchanged"):
        convert(tmp_path / "agent", output, tmp_path / "recordings")
    assert bundled.read_text() == "existing recording\n"
    assert list(output.iterdir()) == [bundled]
