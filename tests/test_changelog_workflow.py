"""Exercise the release filter and formatter used by the changelog workflow."""

import json
import os
import shutil
import subprocess
import unittest
from pathlib import Path


WORKFLOW = Path(__file__).resolve().parents[1] / ".github/workflows/changelog.yml"


@unittest.skipUnless(shutil.which("jq"), "jq is required")
class ChangelogWorkflowTests(unittest.TestCase):
    def test_dev_release_events_are_skipped_but_manual_runs_are_not(self):
        workflow = WORKFLOW.read_text()
        step = workflow.split("        run: |\n", 1)[1].split("      - name: Check out target branch", 1)[0]
        script = "\n".join(line[10:] for line in step.splitlines())
        import tempfile
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "output"
            for event, tag, expected in [("release", "v1-DEV-abc", "false"),
                                         ("release", "v1.0", "true"),
                                         ("workflow_dispatch", "v1-dev", "true")]:
                output.write_text("")
                env = dict(os.environ, EVENT_NAME=event, RELEASE_TAG=tag, GITHUB_OUTPUT=str(output))
                subprocess.run(["bash", "-c", script], env=env, check=True)
                self.assertEqual(output.read_text().strip(), "run=" + expected)

    def test_paginated_releases_are_filtered_and_sorted(self):
        workflow = WORKFLOW.read_text()
        query = workflow.split("            jq -r '", 1)[1].split("\n            ' > target/CHANGELOG.md", 1)[0]
        def release(tag, date, body="", draft=False):
            return {"tag_name": tag, "published_at": date, "body": body,
                    "draft": draft, "html_url": "https://example.com/" + tag}
        pages = [
            [release("v1.0", "2026-01-01T00:00:00Z", "  First\r\nline  "),
             release("v2-dev-abc", "2026-03-01T00:00:00Z"),
             release("v3", "2026-04-01T00:00:00Z", draft=True)],
            [release("v1.1-rc1", "2026-02-01T00:00:00Z"),
             release("v1.1.DEV", "2026-02-02T00:00:00Z"),
             release("v1.1", "2026-02-01T00:00:00Z", "Release")],
        ]
        output = subprocess.run(["jq", "-r", query], input=json.dumps(pages),
                                text=True, check=True, capture_output=True).stdout
        self.assertNotIn("DEV", output)
        self.assertNotIn("dev", output)
        self.assertNotIn("[v3]", output)
        self.assertLess(output.index("[v1.1-rc1]"), output.index("[v1.1]"))
        self.assertLess(output.index("[v1.1]"), output.index("[v1.0]"))
        self.assertIn("First\nline", output)

    def test_manual_target_and_release_pagination_are_explicit(self):
        workflow = WORKFLOW.read_text()
        target = "github.event_name == 'workflow_dispatch' && github.ref_name || github.event.repository.default_branch"
        self.assertIn("gh api --paginate --slurp", workflow)
        self.assertIn("base: ${{ " + target + " }}", workflow)
        self.assertIn("add-paths: CHANGELOG.md", workflow)
