import sys, re, json, collections
sys.path.insert(0, ".")
from gen_data import make_dataset
from ref_np import Ref
R = Ref("campus_ai.pt")
from gen_data import check
def score(cases):  # cases: (prompt, ref, kind, gen)
    stat = collections.defaultdict(lambda: [0, 0]); bad = []
    for p, ref, k, gen in cases:
        ok = check(k, gen, ref)
        stat[k][0] += ok; stat[k][1] += 1
        if not ok: bad.append((p, ref, gen))
    return stat, bad
if __name__ == "__main__":
    data = make_dataset(600, seed=999); cases = []; mx = 0
    for p, ref, k in data:
        gen, n = R.greedy(p); mx = max(mx, n); cases.append((p, ref, k, gen))
    out = [{"prompt": p, "ref": r, "kind": k, "py": g} for p, r, k, g in cases]
    for c in out[:25]:  # TS版との照合用に、最初の25件は次の文字のlogitsも保存
        c["logits_last"] = R.logits([1] + R.enc(c["prompt"]))[-1].tolist()
    json.dump(out, open("cases.json", "w"), ensure_ascii=False)
    stat, bad = score(cases)
    for k, v in sorted(stat.items()): print(f"{k:9s}{v[0]}/{v[1]}")
    print("合計", sum(v[0] for v in stat.values()), "/", sum(v[1] for v in stat.values()), " 最大系列長", mx)
    for b in bad: print(b)
