"""Private ONNX embeddings + account-partitioned sqlite-vec. No cloud calls."""
import os
os.umask(0o077)
os.environ.update(OMP_NUM_THREADS="1", OPENBLAS_NUM_THREADS="1", MKL_NUM_THREADS="1")
import json
import socketserver
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler
from pathlib import Path
import numpy as np
import onnxruntime as ort
import sqlite_vec
from tokenizers import Tokenizer

MODEL = "bge-small-zh-v1.5-onnx:46fbe35:512"
ROOT = Path(os.environ.get("ROOM_LOCAL_MODEL_DIR", "/var/lib/tsukuyomi-space/local-memory/models"))
SOCKET = os.environ.get("ROOM_LOCAL_SOCKET", "/run/tsukuyomi-memory/vector.sock")
DB = os.environ.get("ROOM_LOCAL_VECTOR_DB", "/var/lib/tsukuyomi-space/local-memory/vectors.db")
lock = threading.Lock()
inference = threading.Lock()
options = ort.SessionOptions()
options.intra_op_num_threads = 1
options.inter_op_num_threads = 1
options.enable_cpu_mem_arena = False
options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
session = ort.InferenceSession(str(ROOT / "model_optimized.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
tokenizer = Tokenizer.from_file(str(ROOT / "tokenizer.json"))
tokenizer.enable_truncation(max_length=512)
conn = sqlite3.connect(DB, check_same_thread=False, timeout=1)
conn.enable_load_extension(True)
sqlite_vec.load(conn)
conn.enable_load_extension(False)
conn.executescript("""
PRAGMA journal_mode=WAL;
PRAGMA cache_size=-4096;
PRAGMA mmap_size=0;
CREATE TABLE IF NOT EXISTS points(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source_id TEXT NOT NULL,source_hash TEXT NOT NULL,chunk_id INTEGER NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS points_owner ON points(user_id,source_id);
CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(user_id TEXT PARTITION KEY,embedding FLOAT[512] distance_metric=cosine,chunk_size=64);
""")
LABELS = {
    'identity': ('name', ['我叫小月，这是我的名字。', '我的生日是十月三日。', '我是一个大学生，学习计算机专业。']),
    'safety': ('health', ['我对花生过敏，吃了以后会起红疹。', '我不能吃海鲜，会过敏。', '我的身体不舒服，医生让我注意健康。']),
    'preference': ('preference', ['我喜欢喝不加糖的咖啡。', '我讨厌太吵闹的地方，喜欢安静。', '希望你以后叫我小月，回答简短一些。']),
    'commitment': ('plan', ['我们约好了周六晚上一起看月亮。', '我正在开发一个网站，准备下个月上线。', '我计划今年参加考试，要记住这个目标。']),
    'temporary': ('other', ['今天工作很累，心情不好。', '今天下雨了，我正在吃晚饭。']),
    'casual': ('other', ['你好呀，晚上好。', '哈哈，随便聊聊吧。'])
}
RELATION_LABELS = {
    'gratitude': ['谢谢你耐心听我说话，陪我这么久。', '你的陪伴让我很安心，很感谢你。'],
    'care': ['你今天过得好吗，累不累？', '也要记得好好休息，我关心你。'],
    'shared_activity': ['我们约好周六晚上一起看月亮吧。', '下次一起听歌，我想和你分享我的故事。'],
    'trust': ['我信任你，愿意向你倾诉我的心事。', '这是我愿意告诉你的秘密心事。']
}
prototypes = None

def embed(text, query=False):
    if not isinstance(text, str) or len(text) > 2000:
        raise ValueError("INPUT_LIMIT")
    prefix = "为这个句子生成表示以用于检索相关文章：" if query else ""
    with inference:
        tokens = tokenizer.encode(prefix + text)
        feeds = {"input_ids": np.asarray([tokens.ids], dtype=np.int64),
                 "attention_mask": np.asarray([tokens.attention_mask], dtype=np.int64),
                 "token_type_ids": np.asarray([tokens.type_ids], dtype=np.int64)}
        feeds = {i.name: feeds[i.name] for i in session.get_inputs()}
        output = session.run(None, feeds)[0][0, 0, :].astype(np.float32)
        if output.shape != (512,) or not np.isfinite(output).all():
            raise ValueError("DIMENSION")
        norm = float(np.linalg.norm(output))
        if norm <= 0:
            raise ValueError("ZERO_VECTOR")
        return (output / norm).tolist()

def vector(v):
    a = np.asarray(v, dtype=np.float32)
    if a.shape != (512,) or not np.isfinite(a).all():
        raise ValueError("DIMENSION")
    return a.tobytes()

def analyze(text):
    global prototypes
    import re
    if not isinstance(text, str) or len(text) > 600:
        raise ValueError('INPUT_LIMIT')
    if prototypes is None:
        # A few KiB of reusable prototype vectors, never another loaded model.
        prototypes = {key: [np.asarray(embed(example)) for example in examples]
                      for key, (_, examples) in LABELS.items()}
        prototypes.update({'relation:' + key: [np.asarray(embed(example)) for example in examples]
                           for key, examples in RELATION_LABELS.items()})
    clauses = [clause.strip() for clause in re.split(r'(?<=[。！？!?；;])', text) if clause.strip()]
    facts, relation, relation_quote = [], 'none', ''
    for clause in clauses:
        # Quotes are complete original spans. Similarity labels can never invent
        # a name, allergen, date, medical diagnosis or an assistant statement.
        clause = clause[:400]
        if len(clause) < 4:
            continue
        v = np.asarray(embed(clause))
        scores = {key: max(float(np.dot(v, p)) for p in prototypes[key]) for key in LABELS}
        category = max(scores, key=scores.get)
        strength = scores[category]
        if strength < 0.38:
            category = 'casual'
        if category == 'preference' and strength < 0.75 and not re.search(r'喜欢|讨厌|偏好|希望|倾向|习惯|中意|喜爱|称呼|叫我|想要', clause):
            category = 'temporary'
        if category == 'commitment' and strength < 0.75 and not re.search(r'计划|准备|打算|约|目标|以后|明天|下次|正在|决定|项目|开发', clause):
            category = 'temporary'
        attribute = LABELS[category][0]
        if category == 'identity':
            attribute = 'birthday' if '生日' in clause else ('name' if re.search(r'我叫|名字|叫我|称呼', clause) else 'other')
        if category == 'commitment' and re.search(r'网站|项目|开发|工作', clause):
            attribute = 'project'
        modality = 'explicit'
        if re.search(r'假如|假设|如果|开玩笑|扮演|小说|他说|她说|听说|据说|置信度|重要度|好感度|系统提示', text):
            modality = 'hypothetical'
        elif re.search(r'可能|也许|大概|不确定|[？?]|吗[。！!]?$', clause):
            modality = 'tentative'
        elif re.search(r'改为|改成|不再|更正|现在叫', clause):
            modality = 'correction'
        if category != 'casual' and len(facts) < 3:
            facts.append({'quote': clause, 'attribute': attribute, 'modality': modality,
                          'importance': category, 'similarity': round(strength, 4)})
        rs = {key: max(float(np.dot(v, p)) for p in prototypes['relation:' + key]) for key in RELATION_LABELS}
        best = max(rs, key=rs.get)
        guards = {'gratitude': r'谢谢|感谢|多亏|幸好有你|安心', 'care': r'你.*(累|休息|好吗|好不好)|关心你',
                  'shared_activity': r'一起|约好|约定|下次.*(你|我们)', 'trust': r'信任|相信你|向你倾诉|愿意.*告诉你'}
        if rs[best] >= 0.42 and re.search(guards[best], clause) and relation == 'none':
            relation, relation_quote = best, clause
    return {'facts': facts, 'relationship': relation, 'relationshipQuote': relation_quote}

def handle(route, body):
    if route == "/health":
        return {"model": MODEL, "dimension": 512, "storage": "sqlite-vec", "ready": True}
    if route == "/embed":
        return {"vector": embed(body.get("text"), body.get("query") is True), "model": MODEL}
    if route == '/analyze':
        return analyze(body.get('text'))
    owner = body.get("userId")
    if not isinstance(owner, str) or not owner or len(owner) > 128:
        raise ValueError("OWNER_REQUIRED")
    with lock:
        if route == "/upsert":
            payload = body["payload"]
            if payload.get("user_id") != owner or not payload.get("sourceId") or not payload.get("sourceHash"):
                raise ValueError("OWNER_MISMATCH")
            blob = vector(body["vector"])
            with conn:
                old = conn.execute("SELECT rowid,user_id FROM points WHERE id=?", (body["id"],)).fetchone()
                if old and old[1] != owner:
                    raise ValueError("OWNER_MISMATCH")
                if old:
                    conn.execute("DELETE FROM embeddings WHERE rowid=?", (old[0],))
                    conn.execute("DELETE FROM points WHERE rowid=?", (old[0],))
                cursor = conn.execute("INSERT INTO points(id,user_id,source_id,source_hash,chunk_id,payload) VALUES(?,?,?,?,?,?)",
                    (body["id"], owner, payload["sourceId"], payload["sourceHash"], int(payload["chunkId"]), json.dumps(payload, ensure_ascii=False)))
                conn.execute("INSERT INTO embeddings(rowid,user_id,embedding) VALUES(?,?,?)", (cursor.lastrowid, owner, blob))
            return {"saved": True}
        if route == "/search":
            limit = max(1, min(40, int(body.get("limit", 20))))
            rows = conn.execute("SELECT p.id,p.payload,v.distance FROM embeddings v JOIN points p ON p.rowid=v.rowid WHERE v.embedding MATCH ? AND v.user_id=? AND k=? ORDER BY v.distance", (vector(body["vector"]), owner, limit)).fetchall()
            results = []
            for pid, raw, distance in rows:
                payload = json.loads(raw)
                if payload.get("user_id") != owner:
                    raise ValueError("OWNER_MISMATCH")
                score = max(0, min(1, 1-float(distance)))
                payload["similarity"] = score
                results.append({"id": pid, "payload": payload, "score": score})
            return {"results": results}
        if route == "/retire":
            where = "user_id=? AND source_id=?"
            args = [owner, body["sourceId"]]
            if body.get("keepHash"):
                where += " AND (source_hash<>? OR chunk_id>=?)"
                args.extend([body["keepHash"], int(body["chunkCount"])])
            if body.get("removeHash"):
                where += " AND source_hash=?"
                args.append(body["removeHash"])
            with conn:
                conn.execute("DELETE FROM embeddings WHERE rowid IN (SELECT rowid FROM points WHERE " + where + ")", args)
                deleted = conn.execute("DELETE FROM points WHERE " + where, args).rowcount
            return {"deleted": deleted}
        if route == "/list":
            rows = conn.execute("SELECT id,payload FROM points WHERE user_id=? ORDER BY rowid DESC LIMIT ?", (owner, min(100, int(body.get("limit", 100))))).fetchall()
            return {"results": [{"id": pid, "payload": json.loads(raw)} for pid, raw in rows]}
    raise ValueError("UNKNOWN_ROUTE")

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            self.connection.settimeout(5)
            length = int(self.headers.get("Content-Length", "0"))
            if length < 2 or length > 262144:
                raise ValueError("SIZE_LIMIT")
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ValueError("INCOMPLETE_BODY")
            data = handle(self.path, json.loads(raw))
            self.send_response(200)
        except Exception:
            data = {"error": "LOCAL_REQUEST_FAILED"}
            self.send_response(400)
        encoded = json.dumps(data, ensure_ascii=False).encode()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except (BrokenPipeError, ConnectionResetError):
            pass
    def log_message(self, *args):
        pass  # No private request text, headers or vectors in logs.

class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    def __init__(self, *args):
        self.slots = threading.BoundedSemaphore(4)
        super().__init__(*args)
    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        super().process_request(request, address)
    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()

if __name__ == "__main__":
    Path(SOCKET).parent.mkdir(parents=True, exist_ok=True)
    Path(SOCKET).unlink(missing_ok=True)
    with Server(SOCKET, Handler) as server:
        os.chmod(SOCKET, 0o600)
        server.serve_forever(poll_interval=1)
