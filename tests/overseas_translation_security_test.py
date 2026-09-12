import importlib.util
import os
import pathlib
import sys
import tempfile
import types
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


def load_service(database_path):
    bs4 = types.ModuleType("bs4")
    bs4.BeautifulSoup = object
    bs4.NavigableString = str
    sys.modules["bs4"] = bs4

    argos = types.ModuleType("argostranslate")
    argos_translate = types.ModuleType("argostranslate.translate")
    argos.translate = argos_translate
    sys.modules["argostranslate"] = argos
    sys.modules["argostranslate.translate"] = argos_translate

    os.environ["TSUKUYOMI_TRANSLATION_DB"] = str(database_path)
    source = ROOT / "deploy" / "overseas-translation-service.py"
    spec = importlib.util.spec_from_file_location("overseas_translation_service", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class OverseasTranslationSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.service = load_service(pathlib.Path(cls.temp.name) / "translations.sqlite3")

    @classmethod
    def tearDownClass(cls):
        cls.service.STORE.connection.close()
        cls.temp.cleanup()

    def test_seo_paths_are_query_free_and_allowlisted(self):
        normalize = self.service.normalize_public_seo_path
        self.assertEqual(normalize("/wiki?utm_source=test&cache_bust=1"), "/wiki")
        self.assertEqual(normalize("/pixel?art=42"), "/pixel?art=42")
        self.assertEqual(normalize("/wiki/characters/kaguya/"), "/wiki/characters/kaguya")
        for value in (
            "/pixel?art=0",
            "/pixel?art=42&next=https://attacker.example",
            "/pixel?art=42&art=43",
            "/wiki/characters/not-a-real-entry",
            "/wiki/%6baguya",
            "/terminal",
            "//attacker.example/wiki",
            "/wiki/../terminal",
        ):
            with self.assertRaises(ValueError, msg=value):
                normalize(value)

    def test_translated_api_only_accepts_public_read_routes(self):
        normalize = self.service.normalize_translated_api_path
        self.assertEqual(
            normalize("/en-api/live/abc-123/articles?limit=12"),
            "/en-api/live/abc-123/articles?limit=12",
        )
        self.assertEqual(
            normalize("/en-api/articles/12/messages"),
            "/en-api/articles/12/messages",
        )
        for value in ("/en-api/auth/me", "/en-api/admin/settings", "/en-api/room/memory"):
            with self.assertRaises(ValueError, msg=value):
                normalize(value)

    def test_rate_buckets_and_persistent_cache_are_bounded(self):
        self.assertTrue(self.service.rate_allowed("test-client", "unit", 1))
        self.assertFalse(self.service.rate_allowed("test-client", "unit", 1))

        database = pathlib.Path(self.temp.name) / "bounded.sqlite3"
        store = self.service.TranslationStore(str(database))
        original_limit = self.service.MAX_TRANSLATION_CACHE_ROWS
        self.service.MAX_TRANSLATION_CACHE_ROWS = 3
        try:
            for index in range(4):
                store.put_translation("zh", f"source-{index}", f"translated-{index}")
            store.cache_writes = 127
            store.put_translation("zh", "trigger", "translated-trigger")
            count = store.connection.execute("SELECT COUNT(*) FROM translations").fetchone()[0]
            self.assertLessEqual(count, 3)
        finally:
            self.service.MAX_TRANSLATION_CACHE_ROWS = original_limit
            store.connection.close()


if __name__ == "__main__":
    unittest.main()
