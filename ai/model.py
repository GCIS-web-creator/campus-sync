"""小型GPT(文字単位)。外部のAI・APIは一切使わず、ゼロから学習する。"""
import torch
import torch.nn as nn
import torch.nn.functional as F

PAD, BOS, EOS, UNK = 0, 1, 2, 3


def base_chars():
    """ASCII + ひらがな/カタカナ/句読点 + 全角英数記号 + 改行。足りない文字は学習データから追加される。"""
    cs = [chr(c) for c in range(0x20, 0x7F)] + [chr(c) for c in range(0x3000, 0x3100)]
    cs += [chr(c) for c in range(0xFF01, 0xFF5F)] + ["\n"]
    return cs


class Tokenizer:
    def __init__(self, itos=None, extra=""):
        if itos is None:
            chars = sorted(set(base_chars()) | set(extra))
            itos = ["<pad>", "<bos>", "<eos>", "<unk>"] + chars
        self.itos = itos
        self.stoi = {c: i for i, c in enumerate(itos)}
        self.vocab_size = len(itos)

    def encode(self, s):
        return [self.stoi.get(c, UNK) for c in s]

    def decode(self, ids):
        return "".join(self.itos[i] for i in ids if i > UNK)


class Block(nn.Module):
    def __init__(self, d, h, drop):
        super().__init__()
        self.h = h
        self.ln1, self.ln2 = nn.LayerNorm(d), nn.LayerNorm(d)
        self.qkv = nn.Linear(d, 3 * d)
        self.proj = nn.Linear(d, d)
        self.mlp = nn.Sequential(nn.Linear(d, 4 * d), nn.GELU(), nn.Linear(4 * d, d))
        self.drop = nn.Dropout(drop)

    def forward(self, x):
        B, T, C = x.shape
        q, k, v = self.qkv(self.ln1(x)).split(C, dim=2)
        q, k, v = (t.view(B, T, self.h, C // self.h).transpose(1, 2) for t in (q, k, v))
        y = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        y = y.transpose(1, 2).contiguous().view(B, T, C)
        x = x + self.drop(self.proj(y))
        return x + self.drop(self.mlp(self.ln2(x)))


class GPT(nn.Module):
    def __init__(self, vocab_size, block_size=320, d=128, layers=4, heads=4, drop=0.0):
        super().__init__()
        self.cfg = dict(vocab_size=vocab_size, block_size=block_size, d=d, layers=layers, heads=heads, drop=drop)
        self.block_size = block_size
        self.tok = nn.Embedding(vocab_size, d)
        self.pos = nn.Embedding(block_size, d)
        self.blocks = nn.ModuleList([Block(d, heads, drop) for _ in range(layers)])
        self.ln = nn.LayerNorm(d)
        self.head = nn.Linear(d, vocab_size, bias=False)
        self.head.weight = self.tok.weight  # 重み共有
        self.apply(self._init)

    @staticmethod
    def _init(m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, std=0.02)
            if isinstance(m, nn.Linear) and m.bias is not None:
                nn.init.zeros_(m.bias)

    def forward(self, idx, targets=None):
        B, T = idx.shape
        x = self.tok(idx) + self.pos(torch.arange(T, device=idx.device))
        for b in self.blocks:
            x = b(x)
        logits = self.head(self.ln(x))
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-100)
        return logits, loss

    @torch.no_grad()
    def generate(self, idx, max_new=120, temperature=0.7, top_k=20):
        for _ in range(max_new):
            logits, _ = self(idx[:, -self.block_size:])
            logits = logits[:, -1, :] / max(temperature, 1e-5)
            if top_k:
                v, _ = torch.topk(logits, top_k)
                logits[logits < v[:, [-1]]] = -float("inf")
            nxt = torch.multinomial(F.softmax(logits, dim=-1), 1)
            idx = torch.cat([idx, nxt], dim=1)
            if nxt.item() == EOS:
                break
        return idx
