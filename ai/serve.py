"""推論サーバー(ローカルでPython版を試す用。本番はTypeScript版 lib/campus-ai を使う): python serve.py → POST /ask
{"counts":{"menu":3,"ka":2,"kb":2,"task":1,"room":"あり","vote":"あり","sold":"なし"},"direction":"両方","target":"なし","question":"...","slots":{"N1":"..."}}"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from generate import answer, load

load()


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        b = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        ans = answer(b["counts"], b.get("direction", "両方"), b.get("target", "なし"), b["question"], b.get("slots", {}))
        out = json.dumps({"answer": ans}, ensure_ascii=False).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json; charset=utf-8"); self.end_headers(); self.wfile.write(out)


HTTPServer(("0.0.0.0", 8000), H).serve_forever()
