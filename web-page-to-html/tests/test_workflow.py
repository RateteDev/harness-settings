#!/usr/bin/env python3

import json
import os
import subprocess
import tempfile
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL_ROOT / "scripts"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        pass


class WorkflowTest(unittest.TestCase):
    def setUp(self) -> None:
        runtime_dir = os.environ.get("XDG_RUNTIME_DIR")
        if not runtime_dir:
            self.fail("XDG_RUNTIME_DIR is required for tests")
        self.temp_dir = tempfile.TemporaryDirectory(dir=runtime_dir)
        self.work = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def run_script(self, name: str, *args: Path | str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(SCRIPTS / name), *(str(arg) for arg in args)],
            check=False,
            text=True,
            capture_output=True,
        )

    def test_fetch_inlines_next_css_and_absolutizes_urls(self) -> None:
        site = self.work / "site"
        css_dir = site / "_next/static/chunks"
        css_dir.mkdir(parents=True)
        (css_dir / "app.css").write_text("main{color:red}", encoding="utf-8")
        (site / "index.html").write_text(
            """<!doctype html><html><head>
            <link rel="stylesheet" href="/_next/static/chunks/app.css" />
            </head><body><main>
            <a href="/docs">Docs</a>
            <img src="/_next/image?url=%2Fhero.png&amp;w=640&amp;q=75" />
            </main></body></html>""",
            encoding="utf-8",
        )

        handler = partial(QuietHandler, directory=site)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            output_dir = self.work / "output"
            result = self.run_script("fetch.sh", f"{origin}/index.html", output_dir)
        finally:
            server.shutdown()
            thread.join()
            server.server_close()

        self.assertEqual(result.returncode, 0, result.stderr)
        html = (output_dir / "standalone.html").read_text(encoding="utf-8")
        self.assertIn("<style>main{color:red}", html)
        self.assertNotIn('<link rel="stylesheet"', html)
        self.assertIn(f'href="{origin}/docs"', html)
        self.assertIn(f'src="{origin}/hero.png"', html)

    def test_translation_files_are_merged_and_applied(self) -> None:
        source = self.work / "standalone.html"
        source.write_text(
            '<html lang="en"><body><p>Outside</p><main><p>Hello &amp; welcome</p>'
            '<button>Do not translate this button</button><p>Another sentence</p></main></body></html>',
            encoding="utf-8",
        )
        texts = self.work / "texts.json"
        extract = self.run_script("extract-texts.py", source, texts)
        self.assertEqual(extract.returncode, 0, extract.stderr)
        entries = json.loads(texts.read_text(encoding="utf-8"))
        self.assertEqual(
            entries,
            [
                {"id": 1, "text": "Hello & welcome"},
                {"id": 2, "text": "Another sentence"},
            ],
        )

        translations = self.work / "translations.json"
        translations.write_text(
            json.dumps(
                [
                    {"id": 1, "translated": "こんにちは、A & B"},
                    {"id": 2, "translated": "別の文です"},
                ],
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        translated = self.work / "translated.json"
        merge = self.run_script("merge-translations.py", texts, translations, translated)
        self.assertEqual(merge.returncode, 0, merge.stderr)

        output = self.work / "translated.html"
        apply = self.run_script("apply-translation.py", source, translated, output, "ja")
        self.assertEqual(apply.returncode, 0, apply.stderr)
        html = output.read_text(encoding="utf-8")
        self.assertIn('lang="ja"', html)
        self.assertIn("こんにちは、A &amp; B", html)
        self.assertIn("別の文です", html)
        self.assertIn("Do not translate this button", html)

    def test_merge_rejects_missing_ids(self) -> None:
        texts = self.work / "texts.json"
        texts.write_text(
            json.dumps([{"id": 1, "text": "First sentence"}, {"id": 2, "text": "Second sentence"}]),
            encoding="utf-8",
        )
        translations = self.work / "translations.json"
        translations.write_text(json.dumps([{"id": 1, "translated": "最初の文"}]), encoding="utf-8")
        output = self.work / "translated.json"

        result = self.run_script("merge-translations.py", texts, translations, output)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing translation ids: 2", result.stderr)
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
