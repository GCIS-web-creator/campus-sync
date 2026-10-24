"""学習: python train.py --minutes 8   (GPUがあれば自動で使う / --resume で続きから)"""
import argparse, os, time, random
import torch
from gen_data import make_dataset
from model import GPT, Tokenizer, BOS, EOS, PAD

ap = argparse.ArgumentParser()
ap.add_argument("--minutes", type=float, default=8)
ap.add_argument("--n_data", type=int, default=20000)
ap.add_argument("--batch", type=int, default=32)
ap.add_argument("--lr", type=float, default=2e-3)
ap.add_argument("--out", default="campus_ai.pt")
ap.add_argument("--layers", type=int, default=3)
ap.add_argument("--d", type=int, default=128)
ap.add_argument("--resume", action="store_true", help="--out のファイルがあれば、その続きから学習する")
ap.add_argument("--seed", type=int, default=123, help="学習データの乱数。続きから学習するときは変えると新しいデータになる")
args = ap.parse_args()

dev = "cuda" if torch.cuda.is_available() else "cpu"
print("device:", dev, torch.cuda.get_device_name(0) if dev == "cuda" else "")
torch.manual_seed(0)
data = make_dataset(args.n_data, seed=args.seed)
BLOCK = 192

if args.resume and os.path.exists(args.out):
    ck = torch.load(args.out, map_location="cpu")
    tok = Tokenizer(itos=ck["itos"])           # 文字表は前回のものを引き継ぐ
    model = GPT(**ck["cfg"]); model.load_state_dict(ck["state"])
    print("resumed from", args.out)
else:
    tok = Tokenizer(extra="".join(p + a for p, a, _ in data))
    model = GPT(tok.vocab_size, BLOCK, args.d, args.layers, 4)
model.to(dev)


def encode_pair(prompt, ans):
    p = [BOS] + tok.encode(prompt); a = tok.encode(ans) + [EOS]
    return (p + a)[:BLOCK + 1], ([-100] * len(p) + a)[:BLOCK + 1]  # 回答部分だけ学習


enc = [encode_pair(p, a) for p, a, _ in data]
print("vocab", tok.vocab_size, "samples", len(enc), "max_len", max(len(i) for i, _ in enc))


def batch():
    xs = random.sample(enc, args.batch); L = max(len(i) for i, _ in xs)
    X = torch.full((len(xs), L - 1), PAD); Y = torch.full((len(xs), L - 1), -100)
    for r, (ids, lab) in enumerate(xs):
        n = len(ids) - 1; X[r, :n] = torch.tensor(ids[:-1]); Y[r, :n] = torch.tensor(lab[1:])
    return X.to(dev), Y.to(dev)


print("params(M):", round(sum(p.numel() for p in model.parameters()) / 1e6, 2))
opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
use_amp = dev == "cuda"
scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
t0, step, budget = time.time(), 0, args.minutes * 60


def save():
    state = {k: v.detach().cpu() for k, v in model.state_dict().items()}
    torch.save({"cfg": model.cfg, "state": state, "itos": tok.itos}, args.out + ".tmp")
    os.replace(args.out + ".tmp", args.out)    # 書き込み途中で切れても壊れないように


while time.time() - t0 < budget:
    el = time.time() - t0
    for g in opt.param_groups: g["lr"] = args.lr * min(1, (step + 1) / 100) * (0.1 + 0.9 * (1 - el / budget))
    X, Y = batch()
    with torch.autocast(device_type=dev, dtype=torch.float16, enabled=use_amp):
        _, loss = model(X, Y)
    opt.zero_grad(set_to_none=True)
    scaler.scale(loss).backward(); scaler.unscale_(opt)
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    scaler.step(opt); scaler.update(); step += 1
    if step % 100 == 0: print(f"step {step} loss {loss.item():.3f} {el:.0f}s", flush=True)
    if step % 500 == 0: save()
save(); print("saved", args.out, "steps", step)
