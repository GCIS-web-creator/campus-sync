"""評価: python eval.py  (未見の合成データ。スロットの並び・方面名・定型文が正しいかを種類別に確認)"""
import collections, sys
from generate import template
from gen_data import make_dataset, check

N = int(sys.argv[1]) if len(sys.argv) > 1 else 600
stat = collections.defaultdict(lambda: [0, 0]); bad = []
for p, ref, k in make_dataset(N, seed=999):
    sit, rest = p[len("【状況】"):].split("\n【質問】"); q = rest.split("\n【回答】")[0]
    gen = template(sit, q, 0.1)
    ok = check(k, gen, ref)
    stat[k][0] += ok; stat[k][1] += 1
    if not ok and len(bad) < 10: bad.append((sit, q, ref, gen))
t = [sum(v[0] for v in stat.values()), sum(v[1] for v in stat.values())]
for k, v in sorted(stat.items()): print(f"{k:9s}{v[0]}/{v[1]}")
print("合計", f"{t[0]}/{t[1]} ({t[0]/t[1]:.1%})")
for b in bad: print("\n状況:", b[0], "\n質問:", b[1], "\n正解:", b[2], "\n生成:", b[3])
