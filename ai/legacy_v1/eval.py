"""評価: python eval.py  (未見の合成データ300件。スロットの並び・方面名・定型文が正しいかを確認)"""
import re, collections
from generate import template
from gen_data import make_dataset, FIXED

slots = lambda s: re.findall(r"\{\w+\}", s)
dirs = lambda s: re.findall(r"(?:国分寺|東村山)方面", s)[:1]
stat = collections.defaultdict(lambda: [0, 0]); bad = []
for p, ref, k in make_dataset(300, seed=999):
    sit, rest = p[len("【状況】"):].split("\n【質問】"); q = rest.split("\n【回答】")[0]
    gen = template(sit, q, 0.1)
    if k in FIXED:
        ok = gen in FIXED[k]
    else:
        ok = slots(gen) == slots(ref)
        if k == "train":
            ok = ok and dirs(gen) == dirs(ref) and all((w in gen) == (w in ref) for w in ["最後", "その次", "もうありません"])
    stat[k][0] += ok; stat[k][1] += 1
    if not ok and len(bad) < 6: bad.append((sit, q, ref, gen))
t = [sum(v[0] for v in stat.values()), sum(v[1] for v in stat.values())]
for k, v in sorted(stat.items()): print(f"{k:9s}{v[0]}/{v[1]}")
print("合計", f"{t[0]}/{t[1]} ({t[0]/t[1]:.0%})")
for b in bad: print("\n状況:", b[0], "\n質問:", b[1], "\n正解:", b[2], "\n生成:", b[3])
