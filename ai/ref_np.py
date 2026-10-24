"""numpyによる参照実装(PyTorch版 model.py と同じ計算)。TS版の照合用。"""
import math, numpy as np, ptload
erf = np.vectorize(math.erf)
class Ref:
    def __init__(s, path):
        ck = ptload.load(path); s.w = {k: v.astype(np.float64) for k, v in ck["state"].items()}
        s.cfg = ck["cfg"]; s.itos = ck["itos"]; s.stoi = {c: i for i, c in enumerate(s.itos)}
    def enc(s, t): return [s.stoi.get(c, 3) for c in t]
    def dec(s, ids): return "".join(s.itos[i] for i in ids if i > 3)
    @staticmethod
    def ln(x, g, b): m = x.mean(-1, keepdims=True); v = ((x - m) ** 2).mean(-1, keepdims=True); return (x - m) / np.sqrt(v + 1e-5) * g + b
    def logits(s, ids):
        w, c = s.w, s.cfg; T = len(ids); d, H = c["d"], c["heads"]; hd = d // H
        x = w["tok.weight"][ids] + w["pos.weight"][:T]
        mask = np.triu(np.full((T, T), -np.inf), 1)
        for l in range(c["layers"]):
            p = f"blocks.{l}."
            h = s.ln(x, w[p+"ln1.weight"], w[p+"ln1.bias"])
            qkv = h @ w[p+"qkv.weight"].T + w[p+"qkv.bias"]
            q, k, v = np.split(qkv, 3, axis=1)
            q, k, v = (t.reshape(T, H, hd).transpose(1, 0, 2) for t in (q, k, v))
            a = q @ k.transpose(0, 2, 1) / math.sqrt(hd) + mask
            a = np.exp(a - a.max(-1, keepdims=True)); a /= a.sum(-1, keepdims=True)
            y = (a @ v).transpose(1, 0, 2).reshape(T, d)
            x = x + y @ w[p+"proj.weight"].T + w[p+"proj.bias"]
            h = s.ln(x, w[p+"ln2.weight"], w[p+"ln2.bias"])
            h = h @ w[p+"mlp.0.weight"].T + w[p+"mlp.0.bias"]
            h = 0.5 * h * (1 + erf(h / math.sqrt(2)))
            x = x + h @ w[p+"mlp.2.weight"].T + w[p+"mlp.2.bias"]
        return s.ln(x, w["ln.weight"], w["ln.bias"]) @ w["tok.weight"].T
    def greedy(s, prompt, max_new=110):
        ids = [1] + s.enc(prompt); n0 = len(ids)
        for _ in range(max_new):
            if len(ids) >= s.cfg["block_size"]: break
            nxt = int(np.argmax(s.logits(ids)[-1])); ids.append(nxt)
            if nxt == 2: break
        return s.dec(ids[n0:]), len(ids)
