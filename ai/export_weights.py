"""campus_ai.pt → campus_ai.bin(float32連結) + campus_ai.json(設定・語彙・各テンソルの位置)。torch不要。
使い方: python export_weights.py ../ai/campus_ai.pt 出力ディレクトリ"""
import sys, json, os, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import ptload

src, out = sys.argv[1], sys.argv[2]
ck = ptload.load(src); st = ck["state"]
os.makedirs(out, exist_ok=True)
# head.weight は tok.weight と共有なので書き出さない
names = [k for k in st if k != "head.weight"]
assert np.array_equal(st["head.weight"], st["tok.weight"])
meta, off, chunks = {}, 0, []
for k in names:
    a = np.ascontiguousarray(st[k], dtype="<f4")
    meta[k] = {"offset": off, "shape": list(a.shape)}
    off += a.size; chunks.append(a.ravel())
np.concatenate(chunks).tofile(os.path.join(out, "campus_ai.bin"))
json.dump({"cfg": {k: v for k, v in ck["cfg"].items() if k != "drop"}, "itos": ck["itos"], "tensors": meta, "floats": off},
          open(os.path.join(out, "campus_ai.json"), "w"), ensure_ascii=False)
print("floats", off, "bytes", off * 4)
