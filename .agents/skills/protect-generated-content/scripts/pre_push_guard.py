#!/usr/bin/env python3
"""Fail closed when a push could destroy, overwrite, or expose saved content."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ZERO_SHA = "0" * 40
WORKTREE = "WORKTREE"
EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
PROTECTED_TABLES = (
    "content_items",
    "content_versions",
    "published_content_feed",
    "content_review_comments",
    "content_audit_events",
    "brand_context_docs",
    "eval_results",
)
TABLE_PATTERN = "|".join(re.escape(table) for table in PROTECTED_TABLES)
REQUIRED_GUARDIAN_TABLES = set(PROTECTED_TABLES) | {"content_metrics_daily"}
IMMUTABLE_PROTECTION_PATHS = {
    ".agents/skills/protect-generated-content/SKILL.md",
    ".agents/skills/protect-generated-content/agents/openai.yaml",
    ".agents/skills/protect-generated-content/scripts/pre_push_guard.py",
    ".agents/skills/protect-generated-content/tests/test_pre_push_guard.py",
    ".githooks/pre-push",
    ".github/workflows/content-protection.yml",
}

DESTRUCTIVE_PATTERNS = (
    (
        "destructive SQL against protected content",
        re.compile(
            rf"\b(?:delete\s+from|truncate(?:\s+table)?|drop\s+table)\s+"
            rf"(?:public\.)?(?:{TABLE_PATTERN})\b",
            re.IGNORECASE,
        ),
    ),
    (
        "saved content is being overwritten",
        re.compile(
            r"\bupdate\s+(?:public\.)?content_versions\b|"
            r'\.from\(\s*["\']content_versions["\']\s*\)[\s\S]{0,240}?\.update\(',
            re.IGNORECASE,
        ),
    ),
    (
        "protected content is being deleted through the client",
        re.compile(
            rf'\.from\(\s*["\'](?:{TABLE_PATTERN})["\']\s*\)'
            r"[\s\S]{0,240}?\.delete\(",
            re.IGNORECASE,
        ),
    ),
    (
        "cascade deletion can remove protected content",
        re.compile(
            rf"\breferences\s+(?:public\.)?(?:{TABLE_PATTERN})\s*\([^)]*\)"
            r"[\s\S]{0,120}?\bon\s+delete\s+cascade\b",
            re.IGNORECASE,
        ),
    ),
    (
        "destructive Supabase database command",
        re.compile(
            r"\bsupabase\s+db\s+(?:reset|push\s+--include-all|repair)\b",
            re.IGNORECASE,
        ),
    ),
)

SECRET_PATTERN = re.compile(
    r"(?:SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|"
    r"CRON_SECRET|AGENT_API_KEY)\s*[:=]\s*[\"']?(?!your-|replace-|<)[A-Za-z0-9_.-]{16,}",
    re.IGNORECASE,
)

SENSITIVE_PATH_PATTERN = re.compile(
    r"(^|/)(?:exports?|backups?|dumps?|production-data)(/|$)|"
    r"(^|/)\.codex/work-journal(/|$)|"
    r"(^|/)\.env(?:\.[^/]+)?$|"
    r"(?:content|supabase|database)[-_]?(?:export|backup|dump)\.(?:csv|json|jsonl|sql|zip|gz)$",
    re.IGNORECASE,
)


def scans_content_logic(path: str) -> bool:
    if path in {"package.json", "vercel.json"}:
        return True
    return path.startswith(("src/", "supabase/", "scripts/", ".github/"))


def validate_guardian_text(text: str) -> list[str]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return [".Codex/data-guardian.json: invalid JSON"]
    if data.get("risk_level") != "paranoid":
        return [".Codex/data-guardian.json: risk_level must remain paranoid"]
    databases = data.get("databases")
    if not isinstance(databases, list) or not databases:
        return [".Codex/data-guardian.json: protected database configuration missing"]
    database = databases[0]
    if not isinstance(database, dict) or database.get("always_backup") is not True:
        return [".Codex/data-guardian.json: always_backup must remain true"]
    tables = set(database.get("critical_tables") or [])
    missing = sorted(REQUIRED_GUARDIAN_TABLES - tables)
    if missing:
        return [
            ".Codex/data-guardian.json: required critical tables missing: "
            + ", ".join(missing)
        ]
    branches = set(data.get("protected_branches") or [])
    if not {"main", "production", "staging"}.issubset(branches):
        return [".Codex/data-guardian.json: protected branches were weakened"]
    return []


def file_at_revision(path: str, head: str) -> str:
    if head == WORKTREE:
        return Path(path).read_text()
    return git("show", f"{head}:{path}")


def git(*args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check and result.returncode:
        message = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(message or f"git {' '.join(args)} failed")
    return result.stdout


def default_base(head: str) -> str:
    for candidate in ("origin/main", "origin/master"):
        if git("rev-parse", "--verify", "--quiet", candidate, check=False).strip():
            base = git("merge-base", head, candidate, check=False).strip()
            if base:
                return base
    parent = git("rev-parse", f"{head}^", check=False).strip()
    return parent or EMPTY_TREE


def parse_push_ranges(stdin: str) -> list[tuple[str, str, str]]:
    ranges: list[tuple[str, str, str]] = []
    for line in stdin.splitlines():
        parts = line.split()
        if len(parts) != 4:
            continue
        _local_ref, local_sha, remote_ref, remote_sha = parts
        if local_sha == ZERO_SHA:
            continue
        base = default_base(local_sha) if remote_sha == ZERO_SHA else remote_sha
        ranges.append((base, local_sha, remote_ref))
    return ranges


def changed_files(base: str, head: str) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    args = ["diff", "--name-status", "--find-renames", base]
    if head != WORKTREE:
        args.append(head)
    output = git(*args)
    for line in output.splitlines():
        fields = line.split("\t")
        if len(fields) >= 2:
            rows.append((fields[0], fields[-1]))
    if head == WORKTREE:
        for path in git("ls-files", "--others", "--exclude-standard").splitlines():
            rows.append(("A", path))
    return rows


def added_text(base: str, head: str) -> str:
    args = ["diff", "--unified=0", "--no-color", base]
    if head != WORKTREE:
        args.append(head)
    diff = git(*args)
    kept: list[str] = []
    current_file = ""
    for line in diff.splitlines():
        if line.startswith("+++ b/"):
            current_file = line[6:]
            continue
        if (
            line.startswith("+")
            and not line.startswith("+++")
            and scans_content_logic(current_file)
        ):
            kept.append(f"{current_file}: {line[1:]}")
    if head == WORKTREE:
        for raw_path in git("ls-files", "--others", "--exclude-standard").splitlines():
            if not scans_content_logic(raw_path):
                continue
            path = Path(raw_path)
            try:
                text = path.read_text()
            except (OSError, UnicodeDecodeError):
                continue
            kept.extend(f"{raw_path}: {line}" for line in text.splitlines())
    return "\n".join(kept)


def inspect_range(base: str, head: str, remote_ref: str) -> list[str]:
    problems: list[str] = []

    try:
        problems.extend(
            validate_guardian_text(file_at_revision(".Codex/data-guardian.json", head))
        )
    except (OSError, RuntimeError):
        problems.append(".Codex/data-guardian.json: required guardian configuration missing")

    if remote_ref in ("refs/heads/main", "refs/heads/master", "refs/heads/production", "refs/heads/staging"):
        if subprocess.run(
            ["git", "merge-base", "--is-ancestor", base, head],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ).returncode:
            problems.append(f"{remote_ref}: non-fast-forward update is blocked")

    files = changed_files(base, head)
    for status, path in files:
        if path in IMMUTABLE_PROTECTION_PATHS and status[0] in {"D", "M", "R"}:
            problems.append(
                f"{path}: content-protection enforcement is immutable after installation ({status})"
            )
        if path.startswith("supabase/migrations/") and status[0] in {"D", "M", "R"}:
            problems.append(f"{path}: committed migrations are append-only ({status})")
        if status[0] != "D" and SENSITIVE_PATH_PATTERN.search(path):
            problems.append(f"{path}: content exports and database backups must not be pushed")

    additions = added_text(base, head)
    for label, pattern in DESTRUCTIVE_PATTERNS:
        match = pattern.search(additions)
        if match:
            line = additions[: match.start()].count("\n") + 1
            excerpt = additions.splitlines()[line - 1][:220]
            problems.append(f"{label}: {excerpt}")

    secret = SECRET_PATTERN.search(additions)
    if secret:
        line = additions[: secret.start()].count("\n") + 1
        excerpt = additions.splitlines()[line - 1].split(":", 1)[0]
        problems.append(f"{excerpt}: possible live secret in pushed content")

    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", help="Base Git revision for a manual check")
    parser.add_argument(
        "--head",
        default=WORKTREE,
        help="Head Git revision, or WORKTREE for the current files",
    )
    args = parser.parse_args()

    try:
        if args.base:
            ranges = [(args.base, args.head, "manual check")]
        else:
            push_input = sys.stdin.read()
            ranges = parse_push_ranges(push_input)
            if not ranges:
                ranges = [("HEAD", WORKTREE, "manual check")]

        problems: list[str] = []
        for base, head, remote_ref in ranges:
            problems.extend(inspect_range(base, head, remote_ref))
    except (OSError, RuntimeError) as error:
        print(f"CONTENT PROTECTION FAILED CLOSED: {error}", file=sys.stderr)
        return 2

    if problems:
        print("CONTENT PROTECTION BLOCKED THIS PUSH", file=sys.stderr)
        for problem in dict.fromkeys(problems):
            print(f"  - {problem}", file=sys.stderr)
        print(
            "\nPreserve saved content with append-only versions and forward-only migrations. "
            "Do not bypass with --no-verify.",
            file=sys.stderr,
        )
        return 1

    print("Content protection guard passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
