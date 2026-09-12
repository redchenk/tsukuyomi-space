#!/usr/bin/env python3
"""Offline English translation and crawler rendering for the overseas site."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sqlite3
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ElementTree
from collections import defaultdict, deque
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from bs4 import BeautifulSoup, NavigableString

import argostranslate.translate


LISTEN_HOST = os.environ.get("TSUKUYOMI_TRANSLATION_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("TSUKUYOMI_TRANSLATION_PORT", "8790"))
UPSTREAM = "https://yachiyo.hk"
OVERSEAS = "https://tsukuyomi-space.com"
DB_PATH = os.environ.get(
    "TSUKUYOMI_TRANSLATION_DB",
    "/opt/tsukuyomi-translation/cache/translations.sqlite3",
)
CACHE_VERSION = "v3"
MAX_REQUEST_BYTES = 256 * 1024
MAX_BATCH_TEXTS = 50
MAX_BATCH_CHARS = 20_000
MAX_SEO_URI_BYTES = 2_048
MAX_TRANSLATION_CACHE_ROWS = 20_000
MAX_DOCUMENT_CACHE_ROWS = 2_048
MAX_RATE_BUCKETS = 4_096
TRANSLATE_REQUESTS_PER_MINUTE = 30
API_REQUESTS_PER_MINUTE = 120
SEO_REQUESTS_PER_MINUTE = 30
XML_REQUESTS_PER_MINUTE = 30
MAX_CONCURRENT_TRANSLATIONS = 4
CJK_RE = re.compile(r"[\u3400-\u9fff\u3040-\u30ff]")
JAPANESE_RE = re.compile(r"[\u3040-\u30ff]")
HAN_RE = re.compile(r"[\u3400-\u9fff]")
CJK_BLOCK_RE = re.compile(r"[\u3400-\u9fff\u3040-\u30ff]+")
URL_RE = re.compile(r"(?:https?://|mailto:|/api/|/assets/|/uploads/|/models(?:-v\d+)?/|/lib/)[^\s<>)\]]+")
INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
PRIVATE_PATH_RE = re.compile(
    r"^/(?:terminal|admin|editor|room/settings|room-settings|user-center|notifications|login|register|gallery/manage)(?:/|$)"
)
PUBLIC_SEO_PATHS = frozenset({
    "/", "/hub", "/stage", "/plaza", "/wiki", "/gallery", "/pixel", "/game",
    "/reality", "/room", "/friend-links",
    "/topics/chou-kaguya-hime", "/topics/yachiyo-live2d",
    "/topics/ai-character-room", "/topics/kaguya-yachiyo",
    "/topics/cosmic-princess-kaguya-wiki", "/topics/pixel-art-community",
    "/wiki/characters/kaguya", "/wiki/characters/iroha",
    "/wiki/characters/yachiyo", "/wiki/characters/akira",
    "/wiki/characters/rai", "/wiki/characters/noi", "/wiki/characters/roka",
    "/wiki/characters/mami", "/wiki/characters/fushi", "/wiki/characters/doge",
    "/wiki/characters/otako", "/wiki/characters/terukoto",
    "/wiki/terms/tsukuyomi", "/wiki/terms/yachiyo-cup", "/wiki/terms/kassen",
    "/wiki/terms/black-onyx", "/wiki/terms/remember", "/wiki/terms/reply",
    "/wiki/terms/taketori",
})
PUBLIC_ARTICLE_PATH_RE = re.compile(r"^/articles/[1-9]\d{0,18}(?:/[a-z0-9-]{1,120})?$")
TRANSLATED_API_PATH_RE = re.compile(
    r"^/en-api/(?:live/[a-z0-9-]{1,80}/)?"
    r"(?:settings|hub-preview"
    r"|articles(?:/[a-z0-9_-]{1,80}(?:/(?:messages|live/[a-z0-9-]{1,80}))?)?"
    r"|messages(?:/(?:topics|plaza/latest))?|assets/gallery(?:/public)?"
    r"|pixel-art(?:/(?:preview|gallery|[a-z0-9_-]{1,80}))?|friend-links)/?$",
    re.I,
)
SKIP_JSON_KEYS = {
    "id", "slug", "url", "href", "path", "route", "email", "code", "token",
    "author", "author_username", "username", "owner_username", "user_id", "role",
    "file", "filename", "fileName", "storage_key", "access_url", "preview_url",
    "display_url", "avatar_url", "cover_image", "mime_type", "created_at",
    "updated_at", "published_at", "publish_date",
}
MARKDOWN_KEYS = {"content", "body", "markdown"}
HTML_SKIP_TAGS = {"script", "style", "code", "pre", "noscript", "svg", "math"}
IDENTITY_CLASS_RE = re.compile(r"(?:author|username|user-name|uploader|account-name|profile-name)", re.I)
MANUAL_TRANSLATIONS = {
    "月读空间": "Tsukuyomi Space",
    "欢迎访问月读空间": "Welcome to Tsukuyomi Space",
    "欢迎来到月读空间": "Welcome to Tsukuyomi Space",
    "我知道了": "Got it",
    "欢迎加入QQ群：650625419 详细使用教程可以在“主舞台”-“公告”查看哦~": "Join our QQ community group: 650625419. For detailed guides, open Announcements on the Main Stage.",
    "这是一篇公告哦~": "Welcome to Tsukuyomi Space: Getting Started",
    "关于Agent-os页面的使用说明": "Agent OS User Guide",
    "已修复CVE2026.7.14-17": "Security Fixes: CVE 2026.7.14–17",
    "公告": "Announcements",
    "技术": "Technology",
    "二创": "Fan Works",
    "传说": "Lore",
    "日常": "Journal",
    "翻译": "Translations",
    "像素画": "Pixel Art",
    "图库": "Gallery",
    "留言": "Message",
    "的": "Image",
    "帝アキラ": "Mikado Akira",
    "忠犬オタ公": "Chuken Otako",
    "忠犬宅公": "Chuken Otako",
    "ツクヨミ": "Tsukuyomi",
    "月读／TSUKUYOMI": "Tsukuyomi",
    "八千代杯": "Yachiyo Cup",
    "《竹取物语》": "The Tale of the Bamboo Cutter",
    "辉夜": "Kaguya",
    "かぐや": "Kaguya",
    "酒寄彩叶": "Iroha Sakayori",
    "酒寄彩葉": "Iroha Sakayori",
    "月见八千代": "Tsukimi Yachiyo",
    "月見ヤチヨ": "Tsukimi Yachiyo",
    "驹泽雷": "Rai Komazawa",
    "駒沢雷": "Rai Komazawa",
    "驹泽乃依": "Noi Komazawa",
    "駒沢乃依": "Noi Komazawa",
    "绫䌷芦花": "Roka Ayatsumugi",
    "綾紬芦花": "Roka Ayatsumugi",
    "谏山真实": "Mami Isayama",
    "諌山真実": "Mami Isayama",
    "犬DOGE": "Dog DOGE",
    "乙事照琴": "Terukoto Otsukoto",
    "ray 超かぐや姫！Version": "ray — Cosmic Princess Kaguya Version",
    "メルト CPK! Remix": "Melt (CPK! Remix)",
    "星降る海": "Sea of Falling Stars",
    "私は、わたしの事が好き。": "I Like Who I Am.",
    "ワールドイズマイン CPK! Remix": "World Is Mine (CPK! Remix)",
    "ハッピーシンセサイザ": "Happy Synthesizer",
    "瞬間、シンフォニー。": "A Moment, a Symphony.",
    "ロンリーユニバース": "Lonely Universe",
    "竹取オーバーナイトセンセーション": "Taketori Overnight Sensation",
    "トリノコシティ": "Torinoko City",
    "夢をみる島": "The Island That Dreams",
    "上映、票房与衍生作品": "Release, Box Office and Related Works",
    "日本院线票房节点": "Japanese Theatrical Box Office Milestones",
    "《超时空辉夜姬！》漫画版": "Cosmic Princess Kaguya Manga",
    "《超时空辉夜姬！》小说版": "Cosmic Princess Kaguya Novel",
    "资料与版权说明": "Sources and Copyright",
    "图库图片": "Gallery image",
    "管理员添加的站点": "A site added by the administrator",
    "【问候】": "[Greeting]",
    "【反馈】": "[Feedback]",
}
GLOSSARY = (
    ("超时空辉夜姬", "Cosmic Princess Kaguya"),
    ("月见八千代", "Tsukimi Yachiyo"),
    ("月读空间", "Tsukuyomi Space"),
    ("辉夜姬", "Kaguya"),
    ("八千代", "Yachiyo"),
    ("主舞台", "Main Stage"),
    ("私人居所", "Private Room"),
    ("QQ群", "QQ community group"),
    ("公告", "Announcements"),
)
SEO_ROUTE_COPY = {
    "/": (
        "Tsukuyomi Space | Live2D, Wiki and Creative Community",
        "Explore the Cosmic Princess Kaguya fan wiki, Tsukimi Yachiyo Live2D AI room, translated articles, fan art, pixel art and community posts.",
    ),
    "/hub": (
        "Central Hub | Tsukuyomi Space",
        "See the latest translated announcements, articles, gallery images, plaza messages and pixel art from the Tsukuyomi Space community.",
    ),
    "/stage": (
        "Translated Articles and Announcements | Tsukuyomi Space",
        "Read English announcements, technical notes, fan fiction, translations and creative journals from Tsukuyomi Space.",
    ),
    "/wiki": (
        "Cosmic Princess Kaguya Wiki | Tsukuyomi Space",
        "Explore an English fan wiki covering Cosmic Princess Kaguya characters, music, story, releases, creators and world lore.",
    ),
    "/room": (
        "Tsukimi Yachiyo Live2D AI Room | Tsukuyomi Space",
        "Chat with Tsukimi Yachiyo in an interactive Live2D AI room with voice, memory and configurable language models.",
    ),
    "/plaza": (
        "Community Plaza | Tsukuyomi Space",
        "Read translated community posts, feedback and conversations from Tsukuyomi Space visitors and creators.",
    ),
    "/gallery": (
        "Fan Art Gallery | Tsukuyomi Space",
        "Browse public Cosmic Princess Kaguya fan art, illustrations, screenshots and community gallery uploads.",
    ),
    "/pixel": (
        "192 × 108 Pixel Art Community | Tsukuyomi Space",
        "Create, share and explore 192 × 108 pixel art from the Tsukuyomi Space creative community.",
    ),
    "/game": (
        "Kaguya Run Rhythm Game | Tsukuyomi Space",
        "Play Kaguya Run, a rhythm runner with desktop keyboard, mobile touch and fullscreen controls.",
    ),
    "/reality": (
        "Project, Privacy and Credits | Tsukuyomi Space",
        "Read the project credits, privacy notes, open-source references and responsibility boundaries for Tsukuyomi Space.",
    ),
    "/friend-links": (
        "Partner Sites | Tsukuyomi Space",
        "Discover approved independent sites, blogs and creative partners connected with Tsukuyomi Space.",
    ),
}


def english_slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return slug[:120] or "article"


def split_safe_local_uri(value: str) -> urllib.parse.SplitResult:
    raw = str(value or "")
    if not raw or len(raw.encode("utf-8", "ignore")) > MAX_SEO_URI_BYTES:
        raise ValueError("Invalid URI length")
    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in raw) or "\\" in raw:
        raise ValueError("Invalid URI characters")
    parsed = urllib.parse.urlsplit(raw)
    path = parsed.path
    if parsed.scheme or parsed.netloc or parsed.fragment or not path.startswith("/") or path.startswith("//"):
        raise ValueError("Invalid local URI")
    decoded_path = urllib.parse.unquote(path, errors="strict")
    if decoded_path != path or any(segment in {".", ".."} for segment in path.split("/")):
        raise ValueError("Non-canonical URI")
    return parsed


def normalize_public_seo_path(value: str) -> str:
    parsed = split_safe_local_uri(value)
    path = parsed.path.rstrip("/") or "/"
    if path == "/pixel" and parsed.query:
        query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
        artwork_ids = query.get("art", [])
        if set(query) != {"art"} or len(artwork_ids) != 1 or not re.fullmatch(r"[1-9]\d{0,18}", artwork_ids[0]):
            raise ValueError("Invalid pixel artwork query")
        return f"/pixel?art={artwork_ids[0]}"
    if path in PUBLIC_SEO_PATHS or PUBLIC_ARTICLE_PATH_RE.fullmatch(path):
        return path
    raise ValueError("Path is not publicly indexable")


def normalize_translated_api_path(value: str) -> str:
    parsed = split_safe_local_uri(value)
    if not TRANSLATED_API_PATH_RE.fullmatch(parsed.path):
        raise ValueError("API path is not translatable")
    return urllib.parse.urlunsplit(("", "", parsed.path, parsed.query, ""))


class TranslationStore:
    def __init__(self, path: str) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.connection = sqlite3.connect(path, check_same_thread=False)
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=NORMAL")
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS translations (
                source_hash TEXT PRIMARY KEY,
                source_lang TEXT NOT NULL,
                source_text TEXT NOT NULL,
                translated_text TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                cache_key TEXT PRIMARY KEY,
                content_type TEXT NOT NULL,
                body BLOB NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        self.connection.execute(
            "CREATE INDEX IF NOT EXISTS translations_updated_at_idx ON translations(updated_at)"
        )
        self.connection.execute(
            "CREATE INDEX IF NOT EXISTS documents_updated_at_idx ON documents(updated_at)"
        )
        self.connection.execute(
            """
            DELETE FROM translations
            WHERE source_hash IN (
                SELECT source_hash FROM translations
                ORDER BY updated_at DESC LIMIT -1 OFFSET ?
            )
            """,
            (MAX_TRANSLATION_CACHE_ROWS,),
        )
        self.connection.execute(
            """
            DELETE FROM documents
            WHERE cache_key IN (
                SELECT cache_key FROM documents
                ORDER BY updated_at DESC LIMIT -1 OFFSET ?
            )
            """,
            (MAX_DOCUMENT_CACHE_ROWS,),
        )
        self.connection.commit()
        self.lock = threading.RLock()
        self.cache_writes = 0

    def prune_caches_if_needed(self) -> None:
        self.cache_writes += 1
        if self.cache_writes % 128:
            return
        self.connection.execute(
            """
            DELETE FROM translations
            WHERE source_hash IN (
                SELECT source_hash FROM translations
                ORDER BY updated_at DESC LIMIT -1 OFFSET ?
            )
            """,
            (MAX_TRANSLATION_CACHE_ROWS,),
        )
        self.connection.execute(
            """
            DELETE FROM documents
            WHERE cache_key IN (
                SELECT cache_key FROM documents
                ORDER BY updated_at DESC LIMIT -1 OFFSET ?
            )
            """,
            (MAX_DOCUMENT_CACHE_ROWS,),
        )

    @staticmethod
    def digest(language: str, text: str) -> str:
        return hashlib.sha256(f"{CACHE_VERSION}\0{language}\0{text}".encode("utf-8")).hexdigest()

    def get_translation(self, language: str, text: str) -> str | None:
        key = self.digest(language, text)
        with self.lock:
            row = self.connection.execute(
                "SELECT translated_text FROM translations WHERE source_hash = ?", (key,)
            ).fetchone()
        return row[0] if row else None

    def put_translation(self, language: str, text: str, translated: str) -> None:
        key = self.digest(language, text)
        with self.lock:
            self.connection.execute(
                """
                INSERT INTO translations(source_hash, source_lang, source_text, translated_text, updated_at)
                VALUES(?, ?, ?, ?, ?)
                ON CONFLICT(source_hash) DO UPDATE SET
                    translated_text = excluded.translated_text,
                    updated_at = excluded.updated_at
                """,
                (key, language, text, translated, int(time.time())),
            )
            self.prune_caches_if_needed()
            self.connection.commit()

    def get_document(self, key: str, max_age: int) -> tuple[str, bytes] | None:
        with self.lock:
            row = self.connection.execute(
                "SELECT content_type, body, updated_at FROM documents WHERE cache_key = ?", (key,)
            ).fetchone()
        if not row or int(time.time()) - int(row[2]) > max_age:
            return None
        return row[0], bytes(row[1])

    def put_document(self, key: str, content_type: str, body: bytes) -> None:
        with self.lock:
            self.connection.execute(
                """
                INSERT INTO documents(cache_key, content_type, body, updated_at)
                VALUES(?, ?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                    content_type = excluded.content_type,
                    body = excluded.body,
                    updated_at = excluded.updated_at
                """,
                (key, content_type, body, int(time.time())),
            )
            self.prune_caches_if_needed()
            self.connection.commit()


class EnglishTranslator:
    def __init__(self, store: TranslationStore) -> None:
        self.store = store
        self.model_lock = threading.Lock()
        installed = {language.code for language in argostranslate.translate.get_installed_languages()}
        missing = {"zh", "ja", "en"} - installed
        if missing:
            raise RuntimeError(f"Missing Argos languages: {', '.join(sorted(missing))}")

    @staticmethod
    def source_language(text: str) -> str:
        kana_count = len(JAPANESE_RE.findall(text))
        han_count = len(HAN_RE.findall(text))
        return "ja" if kana_count >= max(2, (han_count + 1) // 2) else "zh"

    @staticmethod
    def split_chunks(text: str, maximum: int = 620) -> list[str]:
        if len(text) <= maximum:
            return [text]
        pieces = re.split(r"(?<=[。！？!?；;\.])(?=\s|[^\s])|(?<=\n)", text)
        chunks: list[str] = []
        current = ""
        for piece in pieces:
            if len(current) + len(piece) <= maximum:
                current += piece
                continue
            if current:
                chunks.append(current)
            while len(piece) > maximum:
                chunks.append(piece[:maximum])
                piece = piece[maximum:]
            current = piece
        if current:
            chunks.append(current)
        return chunks

    @staticmethod
    def protect(text: str) -> tuple[str, dict[str, str]]:
        protected: dict[str, str] = {}

        def replace(match: re.Match[str]) -> str:
            token = f"TSUKTOKEN{len(protected):04d}"
            protected[token] = match.group(0)
            return token

        value = text
        for source, english_text in sorted(MANUAL_TRANSLATIONS.items(), key=lambda item: len(item[0]), reverse=True):
            if len(source) > 1:
                value = value.replace(source, english_text)
        for source, english_name in GLOSSARY:
            value = value.replace(source, english_name)
        value = INLINE_CODE_RE.sub(replace, value)
        value = URL_RE.sub(replace, value)
        return value, protected

    @staticmethod
    def restore(text: str, protected: dict[str, str]) -> str:
        value = text
        for token, original in protected.items():
            value = re.sub(re.escape(token), lambda _match, item=original: item, value, flags=re.I)
            value = value.replace(token.replace("TSUKTOKEN", "TSUK TOKEN "), original)
        return value

    def translate_text(self, value: str) -> str:
        text = str(value or "")
        if not CJK_RE.search(text):
            return text.replace(UPSTREAM, OVERSEAS)
        stripped = text.strip()
        if stripped in MANUAL_TRANSLATIONS:
            leading = text[: len(text) - len(text.lstrip())]
            trailing = text[len(text.rstrip()):]
            return f"{leading}{MANUAL_TRANSLATIONS[stripped]}{trailing}"

        language = self.source_language(text)
        cached = self.store.get_translation(language, text)
        if cached is not None and not CJK_RE.search(cached):
            return cached.replace(UPSTREAM, OVERSEAS)

        leading = text[: len(text) - len(text.lstrip())]
        trailing = text[len(text.rstrip()):]
        core = text.strip()
        protected_core, protected = self.protect(core)
        translated_chunks: list[str] = []
        with self.model_lock:
            for chunk in self.split_chunks(protected_core):
                if CJK_RE.search(chunk):
                    translated_chunks.append(argostranslate.translate.translate(chunk, language, "en"))
                else:
                    translated_chunks.append(chunk)
        translated = self.restore("".join(translated_chunks), protected)
        if CJK_RE.search(translated) and JAPANESE_RE.search(core):
            alternate_language = "zh" if language == "ja" else "ja"
            alternate_chunks: list[str] = []
            with self.model_lock:
                for chunk in self.split_chunks(protected_core):
                    alternate_chunks.append(
                        argostranslate.translate.translate(chunk, alternate_language, "en")
                        if CJK_RE.search(chunk) else chunk
                    )
            alternate = self.restore("".join(alternate_chunks), protected)
            if len(CJK_RE.findall(alternate)) < len(CJK_RE.findall(translated)):
                translated = alternate
        if CJK_RE.search(translated):
            translated = re.sub(r"\s{2,}", " ", CJK_BLOCK_RE.sub(" ", translated)).strip()
            if not translated:
                translated = "Translated content"
        elif not translated.strip():
            translated = "Translated content"
        translated = translated.replace(UPSTREAM, OVERSEAS)
        result = f"{leading}{translated}{trailing}"
        self.store.put_translation(language, text, result)
        return result

    def translate_markdown(self, text: str) -> str:
        if not CJK_RE.search(text):
            return text.replace(UPSTREAM, OVERSEAS)
        output: list[str] = []
        fenced = False
        paragraph: list[str] = []

        def flush() -> None:
            if not paragraph:
                return
            value = "\n".join(paragraph)
            output.append(self.translate_text(value))
            paragraph.clear()

        for line in text.splitlines():
            if line.lstrip().startswith("```"):
                flush()
                fenced = not fenced
                output.append(line)
            elif fenced or not line.strip():
                flush()
                output.append(line)
            elif re.match(r"^\s*!\[[^\]]*]\([^)]*\)\s*$", line):
                flush()
                match = re.match(r"^(\s*!\[)([^\]]*)(]\([^)]*\)\s*)$", line)
                output.append(
                    f"{match.group(1)}{self.translate_text(match.group(2))}{match.group(3)}" if match else line
                )
            else:
                paragraph.append(line)
        flush()
        suffix = "\n" if text.endswith("\n") else ""
        return "\n".join(output) + suffix

    def translate_json(self, value, key: str = ""):
        if isinstance(value, dict):
            translated = {item_key: self.translate_json(item, item_key) for item_key, item in value.items()}
            if "slug" in value and "title" in translated and any(marker in value for marker in ("content_format", "publish_date", "excerpt")):
                translated["slug"] = english_slug(translated["title"])
            return translated
        if isinstance(value, list):
            return [self.translate_json(item, key) for item in value]
        if not isinstance(value, str):
            return value
        if key == "siteTitle":
            return "Tsukuyomi Space"
        if key == "siteAnnouncement":
            return "Welcome to Tsukuyomi Space"
        if key == "visitPopupTitle":
            return "Welcome to Tsukuyomi Space"
        if key == "visitPopupContent":
            return "Join our QQ community group: 650625419. For detailed guides, open Announcements on the Main Stage."
        if key == "visitPopupButton":
            return "Got it"
        if key in {"beianText", "beianUrl", "mpsBeianText", "mpsBeianUrl", "mpsBeianIcon"}:
            return ""
        if key in SKIP_JSON_KEYS or not CJK_RE.search(value):
            return value.replace(UPSTREAM, OVERSEAS)
        if key in MARKDOWN_KEYS:
            return self.translate_markdown(value)
        return self.translate_text(value)

    def translate_html(self, source: str, path: str) -> str:
        soup = BeautifulSoup(source, "html.parser")
        if soup.html:
            soup.html["lang"] = "en"

        for tag in soup.find_all(["script"]):
            if str(tag.get("type", "")).lower() != "application/ld+json" or not tag.string:
                continue
            try:
                payload = json.loads(tag.string)
                tag.string.replace_with(json.dumps(self.translate_json(payload), ensure_ascii=False))
            except (TypeError, ValueError):
                pass

        for node in list(soup.find_all(string=True)):
            if not isinstance(node, NavigableString) or not CJK_RE.search(str(node)):
                continue
            parent = node.parent
            if not parent or parent.name in HTML_SKIP_TAGS:
                continue
            classes = " ".join(parent.get("class", []))
            if IDENTITY_CLASS_RE.search(classes):
                continue
            node.replace_with(self.translate_text(str(node)))

        for tag in soup.find_all(True):
            for attribute in ("alt", "title", "aria-label"):
                if tag.has_attr(attribute) and CJK_RE.search(str(tag[attribute])):
                    tag[attribute] = self.translate_text(str(tag[attribute]))
            if tag.name == "meta" and tag.has_attr("content"):
                name = str(tag.get("name") or tag.get("property") or "").lower()
                if name in {"description", "keywords", "og:title", "og:description", "twitter:title", "twitter:description"}:
                    tag["content"] = self.translate_text(str(tag["content"]))
            for attribute in ("href", "src", "content"):
                if tag.has_attr(attribute):
                    tag[attribute] = str(tag[attribute]).replace(UPSTREAM, OVERSEAS)

        canonical = soup.find("link", rel=lambda value: value and "canonical" in value)
        canonical_url = f"{OVERSEAS}{path.split('#', 1)[0]}"
        if canonical:
            canonical["href"] = canonical_url
        elif soup.head:
            canonical = soup.new_tag("link", rel="canonical", href=canonical_url)
            soup.head.append(canonical)

        for alternate in soup.find_all("link", rel=lambda value: value and "alternate" in value):
            if alternate.get("hreflang"):
                alternate.decompose()
        if soup.head:
            for language, base in (("en", OVERSEAS), ("zh-Hans", UPSTREAM), ("x-default", OVERSEAS)):
                alternate = soup.new_tag("link", rel="alternate", hreflang=language)
                alternate["href"] = f"{base}{path.split('?', 1)[0]}"
                soup.head.append(alternate)
            language_meta = soup.new_tag("meta")
            language_meta["http-equiv"] = "content-language"
            language_meta["content"] = "en"
            soup.head.append(language_meta)
            parsed_route = urllib.parse.urlsplit(path)
            clean_path = parsed_route.path.rstrip("/") or "/"
            seo_key = clean_path
            if clean_path.startswith("/wiki/"):
                seo_key = "/wiki"
            elif clean_path.startswith("/stage/"):
                seo_key = "/stage/article"
            route_title, route_description = SEO_ROUTE_COPY.get(seo_key, (None, None))
            if clean_path == "/pixel" and urllib.parse.parse_qs(parsed_route.query).get("art"):
                route_title = None
                route_description = None
            title_tag = soup.find("title")
            if route_title and title_tag:
                title_tag.string = route_title
            elif title_tag and "Tsukuyomi Space" not in title_tag.get_text():
                title_tag.string = f"{title_tag.get_text(strip=True)} | Tsukuyomi Space"
            final_title = title_tag.get_text(strip=True) if title_tag else "Tsukuyomi Space"
            description_tag = soup.find("meta", attrs={"name": "description"})
            if route_description and description_tag:
                description_tag["content"] = route_description
            final_description = (
                str(description_tag.get("content", "")).strip() if description_tag
                else SEO_ROUTE_COPY["/"][1]
            )
            keywords = f"{final_title}, Cosmic Princess Kaguya wiki, Tsukimi Yachiyo, Live2D AI, anime fan community, fan art, pixel art"
            for name, value in (("keywords", keywords), ("robots", "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1")):
                tag = soup.find("meta", attrs={"name": name})
                if not tag:
                    tag = soup.new_tag("meta")
                    tag["name"] = name
                    soup.head.append(tag)
                tag["content"] = value
            social_values = {
                "og:site_name": "Tsukuyomi Space",
                "og:title": final_title,
                "og:description": final_description,
                "og:url": canonical_url,
                "og:locale": "en_US",
                "twitter:title": final_title,
                "twitter:description": final_description,
            }
            for name, value in social_values.items():
                attribute = "property" if name.startswith("og:") else "name"
                tag = soup.find("meta", attrs={attribute: name})
                if not tag:
                    tag = soup.new_tag("meta")
                    tag[attribute] = name
                    soup.head.append(tag)
                tag["content"] = value
        return str(soup)


STORE = TranslationStore(DB_PATH)
TRANSLATOR: EnglishTranslator | None = None
TRANSLATION_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT_TRANSLATIONS)
SEO_RENDER_LOCK = threading.Lock()
XML_RENDER_LOCK = threading.Lock()


class TranslationServiceBusy(RuntimeError):
    pass


def acquire_translation_slot() -> None:
    if not TRANSLATION_SLOTS.acquire(blocking=False):
        raise TranslationServiceBusy("Translation capacity is busy")


def translator() -> EnglishTranslator:
    global TRANSLATOR
    if TRANSLATOR is None:
        TRANSLATOR = EnglishTranslator(STORE)
    return TRANSLATOR


def fetch_upstream(path: str, user_agent: str = "Tsukuyomi-Overseas/1.0") -> tuple[int, str, bytes]:
    if not path.startswith("/") or path.startswith("//"):
        raise ValueError("Invalid upstream path")
    url = f"{UPSTREAM}{path}"
    request = urllib.request.Request(
        url,
        headers={"Accept": "*/*", "Accept-Encoding": "identity", "User-Agent": user_agent},
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return response.status, response.headers.get_content_type(), response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get_content_type(), error.read()


def translated_api(path: str) -> tuple[int, str, bytes]:
    path = normalize_translated_api_path(path)
    upstream_path = "/api" + path[len("/en-api"):]
    status, content_type, body = fetch_upstream(upstream_path)
    if "json" not in content_type:
        return status, content_type, body
    acquire_translation_slot()
    try:
        payload = json.loads(body.decode("utf-8"))
        translated = translator().translate_json(payload)
        return status, "application/json", json.dumps(translated, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except (UnicodeDecodeError, ValueError):
        return status, content_type, body
    finally:
        TRANSLATION_SLOTS.release()


def translated_seo(path: str) -> tuple[int, str, bytes]:
    path = normalize_public_seo_path(path)
    key = f"seo-v6:{path}"
    cached = STORE.get_document(key, 600)
    if cached:
        return 200, cached[0], cached[1]
    acquire_translation_slot()
    try:
        with SEO_RENDER_LOCK:
            cached = STORE.get_document(key, 600)
            if cached:
                return 200, cached[0], cached[1]
            status, content_type, body = fetch_upstream(
                path,
                "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            )
            if status != 200 or "html" not in content_type:
                return status, content_type, body
            rendered = translator().translate_html(body.decode("utf-8", "replace"), path).encode("utf-8")
            STORE.put_document(key, "text/html", rendered)
            return status, "text/html", rendered
    finally:
        TRANSLATION_SLOTS.release()


def translated_xml(path: str) -> tuple[int, str, bytes]:
    key = f"xml-v7:{path}"
    cached = STORE.get_document(key, 600)
    if cached:
        return 200, cached[0], cached[1]
    acquire_translation_slot()
    try:
        with XML_RENDER_LOCK:
            cached = STORE.get_document(key, 600)
            if cached:
                return 200, cached[0], cached[1]
            status, content_type, body = fetch_upstream(path)
            source = body.decode("utf-8", "replace").replace(UPSTREAM, OVERSEAS)
            for prefix, namespace in re.findall(r'xmlns(?::([A-Za-z_][\w.-]*))?="([^"]+)"', source):
                ElementTree.register_namespace(prefix or "", namespace)
            root = ElementTree.fromstring(source)
            if path == "/sitemap.xml":
                article_status, article_type, article_body = fetch_upstream("/api/articles?limit=100")
                article_slugs: dict[str, str] = {}
                if article_status == 200 and "json" in article_type:
                    article_payload = translator().translate_json(json.loads(article_body))
                    for article in article_payload.get("data", []):
                        if isinstance(article, dict) and article.get("id"):
                            article_slugs[str(article["id"])] = english_slug(article.get("title", ""))
                for location in root.iter():
                    if str(location.tag).split("}")[-1].lower() != "loc":
                        continue
                    current = str(location.text or "")
                    match = re.search(r"/articles/(\d+)(?:/[^<]*)?$", urllib.parse.unquote(current))
                    if match and match.group(1) in article_slugs:
                        location.text = f"{OVERSEAS}/articles/{match.group(1)}/{article_slugs[match.group(1)]}"
            for element in root.iter():
                name = str(element.tag).split("}")[-1].lower()
                if name not in {"title", "description", "summary", "content", "caption", "category"}:
                    continue
                for child in element.iter():
                    for attribute in ("text", "tail"):
                        value = getattr(child, attribute)
                        if value and CJK_RE.search(value):
                            stripped = value.strip()
                            if stripped in MANUAL_TRANSLATIONS:
                                translated = value.replace(stripped, MANUAL_TRANSLATIONS[stripped])
                            else:
                                translated = (
                                    translator().translate_html(value, "/")
                                    if "<" in value and ">" in value
                                    else translator().translate_text(value)
                                )
                            setattr(child, attribute, translated)
            rendered = ElementTree.tostring(root, encoding="utf-8", xml_declaration=True).replace(
                UPSTREAM.encode(), OVERSEAS.encode()
            )
            STORE.put_document(key, content_type, rendered)
            return status, content_type, rendered
    finally:
        TRANSLATION_SLOTS.release()


RATE_LOCK = threading.Lock()
RATE_BUCKETS: defaultdict[str, deque[float]] = defaultdict(deque)


def rate_allowed(client: str, scope: str, limit: int) -> bool:
    now = time.monotonic()
    key = f"{scope}:{str(client or 'unknown')[:128]}"
    with RATE_LOCK:
        if key not in RATE_BUCKETS and len(RATE_BUCKETS) >= MAX_RATE_BUCKETS:
            for existing_key, existing_bucket in list(RATE_BUCKETS.items()):
                while existing_bucket and now - existing_bucket[0] > 60:
                    existing_bucket.popleft()
                if not existing_bucket:
                    RATE_BUCKETS.pop(existing_key, None)
            while len(RATE_BUCKETS) >= MAX_RATE_BUCKETS:
                RATE_BUCKETS.pop(next(iter(RATE_BUCKETS)))
        bucket = RATE_BUCKETS[key]
        while bucket and now - bucket[0] > 60:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


class Handler(BaseHTTPRequestHandler):
    server_version = "TsukuyomiTranslation/1.0"

    def log_message(self, message: str, *args) -> None:
        print(f"{self.address_string()} - {message % args}", flush=True)

    def send_payload(self, status: int, content_type: str, body: bytes, extra_headers=None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8" if content_type.startswith("text/") or "json" in content_type else content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "private, no-store, no-cache, must-revalidate")
        self.send_header("Content-Language", "en")
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        client = self.headers.get("X-Real-IP") or self.client_address[0]
        try:
            if parsed.path == "/health":
                body = json.dumps({"ok": True, "languages": ["zh", "ja", "en"]}).encode()
                return self.send_payload(200, "application/json", body)
            if parsed.path.startswith("/en-api/"):
                if not rate_allowed(client, "api", API_REQUESTS_PER_MINUTE):
                    return self.send_payload(429, "application/json", b'{"error":"Too many requests"}')
                try:
                    normalized = normalize_translated_api_path(self.path)
                except ValueError:
                    return self.send_payload(404, "application/json", b'{"error":"Not found"}')
                return self.send_payload(*translated_api(normalized))
            if parsed.path == "/seo":
                if not rate_allowed(client, "seo", SEO_REQUESTS_PER_MINUTE):
                    return self.send_payload(429, "application/json", b'{"error":"Too many requests"}')
                original = self.headers.get("X-Original-URI", "/")
                try:
                    normalized = normalize_public_seo_path(original)
                except ValueError:
                    return self.send_payload(
                        404,
                        "application/json",
                        b'{"error":"Not found"}',
                        {"X-Robots-Tag": "noindex, nofollow"},
                    )
                return self.send_payload(*translated_seo(normalized))
            if parsed.path in {"/feed.xml", "/sitemap.xml", "/sitemap-images.xml"}:
                if not rate_allowed(client, "xml", XML_REQUESTS_PER_MINUTE):
                    return self.send_payload(429, "application/json", b'{"error":"Too many requests"}')
                return self.send_payload(*translated_xml(parsed.path))
            if parsed.path == "/robots.txt":
                body = (
                    "User-agent: *\nAllow: /\n"
                    "Disallow: /terminal\nDisallow: /admin\nDisallow: /editor\n"
                    "Disallow: /room/settings\nDisallow: /room-settings\n"
                    "Disallow: /user-center\nDisallow: /notifications\n"
                    "Disallow: /login\nDisallow: /register\nDisallow: /gallery/manage\n"
                    f"Sitemap: {OVERSEAS}/sitemap.xml\n"
                    f"Sitemap: {OVERSEAS}/sitemap-images.xml\n"
                ).encode()
                return self.send_payload(200, "text/plain", body)
            self.send_payload(404, "application/json", b'{"error":"Not found"}')
        except TranslationServiceBusy:
            self.send_payload(503, "application/json", b'{"error":"Translation service busy"}')
        except Exception as error:  # Fail visibly without exposing internals.
            print(f"GET {self.path} failed: {error!r}", flush=True)
            self.send_payload(502, "application/json", b'{"error":"Translation service unavailable"}')

    def do_POST(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path != "/translate":
            return self.send_payload(404, "application/json", b'{"error":"Not found"}')
        client = self.headers.get("X-Real-IP") or self.client_address[0]
        if not rate_allowed(client, "translate", TRANSLATE_REQUESTS_PER_MINUTE):
            return self.send_payload(429, "application/json", b'{"error":"Too many requests"}')
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if str(self.headers.get("Content-Type", "")).split(";", 1)[0].strip().lower() != "application/json":
                raise ValueError("Invalid content type")
            if length <= 0 or length > MAX_REQUEST_BYTES:
                raise ValueError("Invalid request size")
            payload = json.loads(self.rfile.read(length))
            texts = payload.get("texts")
            if not isinstance(texts, list) or len(texts) > MAX_BATCH_TEXTS:
                raise ValueError("Invalid texts")
            normalized = [str(text)[:8000] for text in texts]
            if sum(map(len, normalized)) > MAX_BATCH_CHARS:
                raise ValueError("Batch is too large")
            acquire_translation_slot()
            try:
                translated = [translator().translate_text(text) for text in normalized]
            finally:
                TRANSLATION_SLOTS.release()
            body = json.dumps({"translations": translated}, ensure_ascii=False).encode("utf-8")
            self.send_payload(200, "application/json", body)
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_payload(400, "application/json", b'{"error":"Invalid request"}')
        except TranslationServiceBusy:
            self.send_payload(503, "application/json", b'{"error":"Translation service busy"}')
        except Exception as error:
            print(f"POST /translate failed: {error!r}", flush=True)
            self.send_payload(502, "application/json", b'{"error":"Translation service unavailable"}')


def prewarm() -> None:
    paths = [
        "/api/settings",
        "/api/articles?limit=100",
        "/api/messages",
        "/api/messages/topics?limit=100",
        "/api/messages/plaza/latest",
        "/api/assets/gallery/public?limit=100",
        "/api/pixel-art?limit=100",
        "/api/friend-links",
        "/api/hub-preview",
    ]
    engine = translator()
    article_ids: list[str] = []
    for path in paths:
        status, content_type, body = fetch_upstream(path)
        if status != 200 or "json" not in content_type:
            print(f"SKIP {path}: HTTP {status}", flush=True)
            continue
        payload = json.loads(body)
        engine.translate_json(payload)
        if path.startswith("/api/articles?"):
            articles = payload.get("data", [])
            article_ids = [str(item["id"]) for item in articles if isinstance(item, dict) and item.get("id")]
        print(f"WARMED {path}", flush=True)
    for index, article_id in enumerate(article_ids, start=1):
        path = f"/api/articles/{urllib.parse.quote(article_id)}/live/prewarm"
        status, content_type, body = fetch_upstream(path)
        if status == 200 and "json" in content_type:
            engine.translate_json(json.loads(body))
        print(f"WARMED ARTICLE {index}/{len(article_ids)} {article_id}", flush=True)
    seo_paths = {
        "/",
        "/hub",
        "/stage",
        "/plaza",
        "/wiki",
        "/gallery",
        "/pixel",
        "/game",
        "/reality",
        "/room",
        "/friend-links",
    }
    for path in ("/feed.xml", "/sitemap.xml", "/sitemap-images.xml"):
        status, _content_type, body = translated_xml(path)
        print(f"WARMED {path}", flush=True)
        if path == "/sitemap.xml" and status == 200:
            sitemap = ElementTree.fromstring(body)
            for location in sitemap.iter():
                if str(location.tag).split("}")[-1].lower() != "loc":
                    continue
                candidate = urllib.parse.urlsplit(str(location.text or "").strip())
                if candidate.netloc == "tsukuyomi-space.com" and not PRIVATE_PATH_RE.match(candidate.path):
                    seo_paths.add(candidate.path or "/")
    ordered_paths = sorted(seo_paths, key=lambda value: (value.count("/"), value))
    for index, path in enumerate(ordered_paths, start=1):
        status, content_type, _body = translated_seo(path)
        outcome = "WARMED" if status == 200 and "html" in content_type else f"SKIP HTTP {status}"
        print(f"{outcome} SEO {index}/{len(ordered_paths)} {path}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prewarm", action="store_true")
    args = parser.parse_args()
    if args.prewarm:
        prewarm()
        return
    translator()  # Fail before accepting traffic if models are unavailable.
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
    print(f"Listening on {LISTEN_HOST}:{LISTEN_PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
