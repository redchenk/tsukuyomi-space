"""Real HTML/cache regressions; no translation models or network calls.

Use the overseas service venv (beautifulsoup4 is its existing dependency), or
an isolated local test venv. The security-only suite runs without this package.
"""
import importlib.util
import pathlib
import sys
import tempfile
import types
import unittest
import os
from unittest import mock

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

ROOT = pathlib.Path(__file__).resolve().parents[1]


@unittest.skipUnless(BeautifulSoup, "Requires existing translation dependency beautifulsoup4")
class OverseasSeoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.folder = pathlib.Path(cls.temp.name)
        argos = types.ModuleType("argostranslate")
        argos.translate = types.ModuleType("argostranslate.translate")
        sys.modules["argostranslate"] = argos
        sys.modules["argostranslate.translate"] = argos.translate
        os.environ["TSUKUYOMI_TRANSLATION_DB"] = str(cls.folder / "cache.sqlite3")
        spec = importlib.util.spec_from_file_location("seo_service", ROOT / "deploy/overseas-translation-service.py")
        cls.service = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.service)
        cls.service.FRONTEND_INDEX = str(cls.folder / "index.html")
        cls.document = b'<html><head><title>Public content</title><link rel="canonical" href="https://yachiyo.hk/pixel"><script type="module" src="/assets/old.js"></script></head><body><div id="app"><noscript><h1>Public pixel content</h1></noscript></div></body></html>'

    @classmethod
    def tearDownClass(cls):
        cls.service.STORE.connection.close()
        cls.temp.cleanup()

    def setUp(self):
        self.write_shell("current")

    def write_shell(self, revision):
        (self.folder / "index.html").write_text(f'<html><head><meta http-equiv="Content-Security-Policy" content="default-src self"><script type="module" src="/assets/{revision}.js"></script><link rel="stylesheet" href="/assets/{revision}.css"></head><body><div id="app"></div></body></html>')

    def test_cached_documents_always_attach_current_frontend_resources(self):
        result = self.service.attach_frontend(self.document)
        self.assertIn(b'/assets/current.js', result)
        self.assertNotIn(b'/assets/old.js', result)
        self.assertIn(b'<noscript>', result)
        self.write_shell("next")
        result = self.service.cached_seo_payload(("text/html", self.document))[2]
        self.assertIn(b'/assets/next.js', result)
        self.assertNotIn(b'/assets/current.js', result)

    def test_topics_remain_standalone_and_tombstones_keep_status(self):
        topic = self.document.replace(b'/pixel', b'/topics/chou-kaguya-hime')
        self.assertEqual(self.service.attach_frontend(topic), topic)
        self.assertEqual(self.service.cached_seo_payload(("text/html;status=404", b"Not found")), (404, "text/html", b"Not found"))

    def test_cached_brand_urls_and_theme_follow_the_current_shell(self):
        stale = self.document.replace(b'</head>', b'<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/old-apple.png"><link rel="manifest" href="/old.webmanifest"><meta name="theme-color" content="#old"></head>')
        (self.folder / 'index.html').write_text('<html><head><link rel="icon" href="/assets/favicon-newhash.ico"><link rel="apple-touch-icon" href="/assets/apple-newhash.png"><link rel="manifest" href="/assets/site-newhash.webmanifest"><meta name="theme-color" content="#f7f9fc"></head><body><div id="app"></div></body></html>')
        result = self.service.cached_seo_payload(('text/html', stale))[2]
        soup = BeautifulSoup(result, 'html.parser')
        self.assertEqual([tag['href'] for tag in soup.select('link[rel="icon"]')], ['/assets/favicon-newhash.ico'])
        self.assertEqual(soup.select_one('link[rel="apple-touch-icon"]')['href'], '/assets/apple-newhash.png')
        self.assertEqual(soup.select_one('link[rel="manifest"]')['href'], '/assets/site-newhash.webmanifest')
        self.assertEqual(soup.select_one('meta[name="theme-color"]')['content'], '#f7f9fc')
        self.assertIn(b'Public content', result)
        self.assertIn(b'<noscript>', result)

    def test_fresh_and_stale_reads_never_wait_for_translation(self):
        with mock.patch.object(self.service.STORE, "get_document", return_value=("text/html", self.document)), mock.patch.object(self.service, "fetch_upstream") as fetch, mock.patch.object(self.service, "schedule_seo_refresh") as schedule:
            self.assertEqual(self.service.translated_seo("/pixel")[0], 200)
            fetch.assert_not_called()
            schedule.assert_not_called()
        with mock.patch.object(self.service.STORE, "get_document", side_effect=[None, ("text/html", self.document)]), mock.patch.object(self.service, "fetch_upstream") as fetch, mock.patch.object(self.service, "schedule_seo_refresh") as schedule:
            self.assertEqual(self.service.translated_seo("/pixel")[0], 200)
            fetch.assert_not_called()
            schedule.assert_called_once_with("/pixel")

    def test_cold_document_is_real_public_content_and_translation_is_deferred(self):
        with mock.patch.object(self.service.STORE, "get_document", return_value=None), mock.patch.object(self.service, "fetch_upstream", return_value=(200, "text/html", self.document)) as fetch, mock.patch.object(self.service, "schedule_seo_refresh") as schedule, mock.patch.object(self.service, "translator") as translator:
            result = self.service.translated_seo("/pixel")
            self.assertEqual(result[0], 200)
            self.assertIn(b'Public pixel content', result[2])
            self.assertIn(b'/assets/current.js', result[2])
            fetch.assert_called_once()
            schedule.assert_called_once()
            translator.assert_not_called()
        with mock.patch.object(self.service.STORE, "get_document", return_value=None), mock.patch.object(self.service, "fetch_upstream", return_value=(404, "text/html", b"Missing")), mock.patch.object(self.service, "schedule_seo_refresh") as schedule:
            self.assertEqual(self.service.translated_seo("/pixel?art=9999")[0], 404)
            schedule.assert_not_called()

    def test_refresh_queue_deduplicates_and_respects_backoff(self):
        fake_thread = mock.Mock()
        with mock.patch.object(self.service, "SEO_REFRESH_THREAD", fake_thread), mock.patch.object(self.service, "SEO_REFRESH_PENDING", set()), mock.patch.object(self.service, "SEO_REFRESH_RETRY", {}), mock.patch.object(self.service, "SEO_REFRESH_QUEUE") as queue:
            self.service.schedule_seo_refresh("/pixel")
            self.service.schedule_seo_refresh("/pixel")
            queue.put_nowait.assert_called_once_with("/pixel")
        with mock.patch.object(self.service, "SEO_REFRESH_RETRY", {"/pixel": float("inf")}), mock.patch.object(self.service, "SEO_REFRESH_QUEUE") as queue:
            self.service.schedule_seo_refresh("/pixel")
            queue.put_nowait.assert_not_called()

    def test_public_profiles_are_encoded_once_and_traversal_is_rejected(self):
        normalize = self.service.normalize_public_seo_path
        self.assertEqual(normalize("/users/%E5%88%9B%E4%BD%9C%E8%80%85"), "/users/%E5%88%9B%E4%BD%9C%E8%80%85")
        self.assertEqual(normalize("/articles/247/%E4%BD%9C%E5%93%81"), "/articles/247")
        for path in ("/users/../terminal", "/users/%2e%2e", "/users/x%2fy", "/users/x%00y", "/users/" + "x" * 33, "/articles/247/%2e%2e", "/articles/247/x%2f..%2fterminal"):
            with self.assertRaises(ValueError, msg=path):
                normalize(path)

    def test_translated_jsonld_cannot_close_script_and_noindex_is_preserved(self):
        translator = self.service.EnglishTranslator.__new__(self.service.EnglishTranslator)
        payload = self.service.safe_json_for_html({"@type": "Article", "headline": "</script><script>attack()</script>", "inLanguage": "zh-CN"})
        source = '<html><head><title>Actual article</title><meta name="robots" content="noindex,follow"><script type="application/ld+json">' + payload + '</script></head><body><h1>Article</h1></body></html>'
        result = translator.translate_html(source, "/articles/247/actual-title")
        soup = BeautifulSoup(result, "html.parser")
        self.assertEqual(len(soup.find_all("script")), 1)
        self.assertNotIn("</script><script>attack", result)
        self.assertIn("noindex", soup.find("meta", attrs={"name": "robots"})["content"])
        self.assertEqual(soup.find("link", attrs={"rel": "canonical"})["href"], "https://tsukuyomi-space.com/articles/247")


if __name__ == "__main__":
    unittest.main()
