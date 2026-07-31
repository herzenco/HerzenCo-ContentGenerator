from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


GUARD_PATH = Path(__file__).resolve().parents[1] / "scripts" / "pre_push_guard.py"
SPEC = importlib.util.spec_from_file_location("pre_push_guard", GUARD_PATH)
assert SPEC and SPEC.loader
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)


class ContentProtectionPatternTests(unittest.TestCase):
    def assert_blocked(self, text: str) -> None:
        self.assertTrue(
            any(pattern.search(text) for _label, pattern in guard.DESTRUCTIVE_PATTERNS),
            text,
        )

    def assert_allowed(self, text: str) -> None:
        self.assertFalse(
            any(pattern.search(text) for _label, pattern in guard.DESTRUCTIVE_PATTERNS),
            text,
        )

    def test_blocks_sql_delete_from_saved_content(self) -> None:
        self.assert_blocked("delete from public.content_items where id = target_id;")

    def test_blocks_public_feed_deletion(self) -> None:
        self.assert_blocked(
            "delete from public.published_content_feed where id = target_id;"
        )

    def test_blocks_content_version_overwrite(self) -> None:
        self.assert_blocked(
            'admin.from("content_versions").update({ body_mdx: next_body })'
        )

    def test_blocks_client_content_deletion(self) -> None:
        self.assert_blocked(
            'admin.from("content_review_comments").delete().eq("id", id)'
        )

    def test_blocks_eval_history_deletion(self) -> None:
        self.assert_blocked(
            'admin.from("eval_results").delete().eq("content_version_id", id)'
        )

    def test_blocks_destructive_database_reset(self) -> None:
        self.assert_blocked("npx supabase db reset")

    def test_allows_append_only_version_insert(self) -> None:
        self.assert_allowed(
            'admin.from("content_versions").insert({ version: next_version })'
        )

    def test_allows_reversible_visibility_update(self) -> None:
        self.assert_allowed(
            "update public.published_content_feed set visible = false where id = target_id;"
        )

    def test_sensitive_paths_cover_work_journals_and_env(self) -> None:
        self.assertRegex(
            ".codex/work-journal/2026-07-30.jsonl",
            guard.SENSITIVE_PATH_PATTERN,
        )
        self.assertRegex(".env.local", guard.SENSITIVE_PATH_PATTERN)

    def test_guardian_configuration_must_remain_paranoid(self) -> None:
        valid = """
        {
          "risk_level": "paranoid",
          "protected_branches": ["main", "production", "staging"],
          "databases": [{
            "always_backup": true,
            "critical_tables": [
              "content_items", "content_versions", "published_content_feed",
              "content_review_comments", "content_audit_events",
              "brand_context_docs", "eval_results", "content_metrics_daily"
            ]
          }]
        }
        """
        self.assertEqual([], guard.validate_guardian_text(valid))
        self.assertTrue(
            guard.validate_guardian_text(valid.replace('"paranoid"', '"normal"'))
        )


if __name__ == "__main__":
    unittest.main()
