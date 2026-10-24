"""answer(): モデルが文の型を生成 → fill(): スロット({N1}など)をDBの値で埋める。(v2)"""
import re, torch
from model import GPT, Tokenizer, BOS
from gen_data import fmt_prompt, situation

_m = _tok = None


def load(path="campus_ai.pt"):
    global _m, _tok
    ck = torch.load(path, map_location="cpu")
    _tok = Tokenizer(itos=ck["itos"]); _m = GPT(**ck["cfg"]); _m.load_state_dict(ck["state"]); _m.eval()


def template(sit, question, temperature=0.1):
    if _m is None: load()
    ids = [BOS] + _tok.encode(fmt_prompt(sit, question))
    out = _m.generate(torch.tensor([ids]), 110, temperature)[0].tolist()[len(ids):]
    return _tok.decode(out)


def fill(tpl, slots):
    """スロットを実際の値で置換。値が無いスロットがあれば None(=答えられない)。"""
    miss = [k for k in re.findall(r"\{(\w+)\}", tpl) if k not in slots]
    return None if miss else re.sub(r"\{(\w+)\}", lambda m: str(slots[m.group(1)]), tpl)


def answer(c, direction, target, question, slots):
    """c = {'menu':n,'ka':国分寺の本数,'kb':東村山の本数,'task':n,'room':'あり'|'なし','vote':'あり'|'なし','sold':'あり'|'なし'}
    direction = '国分寺方面'|'東村山方面'|'両方'、target = 'なし'|'学食'|'課題'|'教室'"""
    sit = situation(c["menu"], c["ka"], c["kb"], c["task"], c.get("room", "なし"), direction, target, c.get("vote", "なし"), c.get("sold", "なし"))
    return fill(template(sit, question), slots) or "すみません、うまく答えられませんでした。"
