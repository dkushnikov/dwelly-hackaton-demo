"""Manage the demo's isolated, pinned upstream agent checkout using Git's CLI."""

import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "agent-source.json"
CHECKOUT = ROOT / ".deps/lettings-ops-agent"
# Only the agent runtime, synthetic fixtures, public data and upstream metadata.
# No workstation files or untracked recordings are copied from a sibling checkout.
SPARSE_PATHS = [
    "/harness/", "/mockworld/", "/agent/", "/fixtures/", "/data/", "/evalkit/",
    "/pyproject.toml", "/uv.lock", "/LICENSE", "/NOTICE", "/README.md", "/.gitignore",
    "!.env*", "!**/.env*", "!secrets/", "!**/secrets/", "!*.pem", "!*.key",
    "!.ssh/", "!**/.ssh/", "!.aws/", "!**/.aws/", "!**/config/cred/", "!**/config/local.php",
    "!*token*", "!*TOKEN*", "!AGENTS.md", "!**/AGENTS.md", "!CLAUDE.md", "!**/CLAUDE.md",
    "!.claude/", "!**/.claude/", "!.githooks/", "!**/.githooks/", "!**/.github/instructions/", "!hooks/", "!**/hooks/",
]
REQUIRED = ("harness/loop.py", "harness/schema.py", "harness/llm.py", "agent/rulebook.yaml", "mockworld/adapter.py", "mockworld/data/world.yaml")


def git(*args, cwd=None, input_text=None, check=True):
    return subprocess.run(["git", *args], cwd=cwd, input=input_text, text=True, capture_output=True, check=check)


def load_source(path):
    data = json.loads(path.read_text())
    if not isinstance(data, dict) or not isinstance(data.get("revision"), str) or not re.fullmatch(r"[0-9a-f]{40}", data["revision"]):
        raise ValueError("agent-source.json must pin a full 40-character Git revision")
    if not isinstance(data.get("repository"), str) or not re.fullmatch(r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git", data["repository"]):
        raise ValueError("Use a credential-free https://github.com/owner/repo.git URL")
    branch = data.get("branch", "")
    if not isinstance(branch, str) or not branch or branch.startswith("-") or git("check-ref-format", "--branch", branch, check=False).returncode:
        raise ValueError("Invalid upstream branch")
    return data


def inspect_checkout(checkout, source):
    if checkout.is_symlink():
        raise ValueError("The managed dependency must be a separate checkout, not a symlink")
    if not checkout.exists():
        return None
    # rev-parse must resolve this exact directory, never the parent demo repository.
    top = git("rev-parse", "--show-toplevel", cwd=checkout, check=False)
    if top.returncode or Path(top.stdout.strip()).resolve() != checkout.resolve():
        raise ValueError("Dependency directory exists but is not an isolated Git checkout")
    common = Path(git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=checkout).stdout.strip()).resolve()
    if not common.is_relative_to(checkout.resolve()):
        raise ValueError("Dependency shares Git metadata with another checkout; create an independent clone")
    remote = git("remote", "get-url", "origin", cwd=checkout).stdout.strip()
    if remote != source["repository"]:
        raise ValueError("Dependency origin differs from agent-source.json; refusing to update")
    if git("status", "--porcelain", "--untracked-files=all", cwd=checkout).stdout:
        raise ValueError("Dependency contains local edits or untracked files; preserve them before syncing")
    return git("rev-parse", "HEAD", cwd=checkout, check=False).stdout.strip() or None


def verify_files(checkout):
    if any(not (checkout / name).is_file() or not (checkout / name).resolve().is_relative_to(checkout.resolve()) for name in REQUIRED):
        raise ValueError("Pinned revision lacks required agent runtime files; review the integration contract")


def check_ignored_collisions(checkout, revision):
    # Sparse checkout can overwrite ignored files despite switch's protection flag.
    # Compare paths only; do not read local ignored files or print their names.
    ignored = git("ls-files", "--others", "--ignored", "--exclude-standard", "-z", cwd=checkout).stdout.split("\0")
    targets = set(git("ls-tree", "-r", "--name-only", "-z", revision, cwd=checkout).stdout.split("\0")) - {""}
    target_dirs = {str(parent) for name in targets for parent in Path(name).parents}
    for name in filter(None, ignored):
        if name in targets or name in target_dirs or any(str(parent) in targets for parent in Path(name).parents):
            raise ValueError("Dependency contains ignored files that conflict with the target revision; preserve them before syncing")


def sync(source, checkout, *, update=False, lock_path=None):
    if update and lock_path is None:
        raise ValueError("Updating requires a lock file destination")
    current = inspect_checkout(checkout, source)
    if not checkout.exists():
        checkout.parent.mkdir(parents=True, exist_ok=True)
        git("clone", "--filter=blob:none", "--no-checkout", "--origin", "origin", source["repository"], str(checkout))
        git("sparse-checkout", "set", "--no-cone", "--stdin", cwd=checkout, input_text="\n".join(SPARSE_PATHS) + "\n")
        # clone --no-checkout has HEAD but no user work; sparse-checkout prepares the selected tree.
    if update:
        git("fetch", "--no-tags", "origin", f"refs/heads/{source['branch']}", cwd=checkout)
        revision = git("rev-parse", "FETCH_HEAD^{commit}", cwd=checkout).stdout.strip()
        present = git("cat-file", "-e", f"{source['revision']}^{{commit}}", cwd=checkout, check=False)
        if present.returncode:
            git("fetch", "--no-tags", "origin", source["revision"], cwd=checkout)
        if git("merge-base", "--is-ancestor", source["revision"], revision, cwd=checkout, check=False).returncode:
            raise ValueError("Upstream is not a fast-forward from the pin; inspect its history before updating")
    else:
        revision = source["revision"]
        if git("cat-file", "-e", f"{revision}^{{commit}}", cwd=checkout, check=False).returncode:
            git("fetch", "--no-tags", "origin", revision, cwd=checkout)
    for name in REQUIRED:
        if git("cat-file", "-e", f"{revision}:{name}", cwd=checkout, check=False).returncode:
            raise ValueError(f"Target revision lacks {name}; the existing pin is unchanged")
    check_ignored_collisions(checkout, revision)
    git("switch", "--no-overwrite-ignore", "--detach", revision, cwd=checkout)
    verify_files(checkout)
    if update:
        lock_path.write_text(json.dumps({**source, "revision": revision}, indent=2) + "\n")
    print(f"Agent checkout: {checkout}")
    print(f"Revision: {revision}" + (" (unchanged)" if current == revision else ""))
    print("Pinned source is ready. Restart live sessions after an update; run make test-agent before using it.")
    return revision


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("sync", "update", "status", "check"))
    args = parser.parse_args()
    try:
        source = load_source(LOCK)
        if not CHECKOUT.parent.resolve().is_relative_to(ROOT.resolve()):
            raise ValueError("The dependency directory must stay inside this demo workspace")
        if args.command in ("sync", "update"):
            sync(source, CHECKOUT, update=args.command == "update", lock_path=LOCK)
        else:
            current = inspect_checkout(CHECKOUT, source)
            print(f"Upstream: {source['repository']} ({source['branch']})")
            print(f"Pinned revision: {source['revision']}")
            print(f"Local revision: {current or 'not installed; run make agent-sync'}")
            if args.command == "check":
                if current != source["revision"]:
                    raise ValueError("Managed agent is missing or differs from the pin; run make agent-sync")
                verify_files(CHECKOUT)
    except subprocess.CalledProcessError as exc:
        # Credential-free repository URL is validated above; Git diagnostics explain network failures.
        parser.exit(1, f"Git command failed ({exc.returncode}): {' '.join(exc.cmd)}\n{exc.stderr}")
    except (OSError, ValueError) as exc:
        parser.exit(1, f"{exc}\n")


if __name__ == "__main__":
    main()
