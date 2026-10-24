"""Campus Sync 専用AI の学習データ生成 v2(スロット方式)。
モデルは「値を含まない文の型」だけを生成する。{N1}{K1}{H1} などのスロットはアプリがDBの値で埋める。
モデルが見る情報: 状況(各データの件数・方面・質問が指す対象・投票/売り切れの有無) + 質問。

【v2の状況行】
  学食{n}件 国分寺{n}件 東村山{n}件 課題{n}件 教室{あり|なし} 方面{国分寺方面|東村山方面|両方} 対象{なし|学食|課題|教室} 投票{あり|なし} 売切{あり|なし}
  ・国分寺/東村山 = 現在時刻以降の電車の本数(最大3)。方面は質問に方面名が無ければ「両方」。
  ・投票 = 食堂全体の混雑投票が1件以上あるか。売切 = 対象メニューが売り切れか(対象=学食のとき) / 売り切れメニューが1つ以上あるか(一覧の質問のとき)。

【v2のスロット(回答中の {...} をアプリが置換)】
  {N1..N4}メニュー名 {K1..K4}カロリー {A1..A4}アレルギー / {TN}{TK}{TA}対象メニュー
  電車(国分寺 or 質問で指定された方面): {H1..H3}発車時刻 {S1..S3}種別 {M1}次の電車まで何分
  電車(「両方」のときの東村山): {EH1..EH3}{ES1..ES3}{EM1}
  {J1..J3}課題名 {D1..D3}期限 / {TJ}{TD}対象課題
  {CR}食堂の混み具合(混んでいる/普通/空いている) {CN}投票数 / {SL}売り切れメニュー名(、区切り)
  {RL}教室一覧(アプリが全教室を「1-A教室は快適（25℃）、図書室はやや寒い（24℃）…」の形に整えた1つの文字列) / {TR}{TS}対象教室とその状態(例: やや寒い（24℃）)
  ・教室 = 教室の状況データが1件以上あるか。
"""
import random

DIRS = ["国分寺方面", "東村山方面"]
FOODS = ["カレー", "ラーメン", "うどん", "そば", "丼", "定食", "パスタ", "オムライス", "ハンバーグ", "唐揚げ", "天ぷら", "焼きそば", "チャーハン"]
SUBJ = ["数学", "英語", "国語", "物理", "化学", "生物", "日本史", "世界史", "地理", "情報", "古典", "現代文"]
KIND = ["小テスト", "レポート", "ワーク", "プリント", "提出物", "宿題"]
# 「見つかりません」の学習用に使う、データに無い場所の名前(実際の教室名は質問中で {TR} に置き換わるので、ここには入れない)
ROOMS = ["栄冠ホール", "第一体育館", "音楽室", "理科室", "視聴覚室", "多目的室", "講堂", "職員室", "2-B教室", "体育館"]
NOISE_CHAR = "☃"  # 未知文字のふり

PREFIX = ["", "", "", "", "ねえ、", "すみません、", "あの、", "ちょっと聞きたいんだけど、", "教えて、"]
SUFFIX = ["?", "?", "？", "", "かな?", "かな？", "ですか?", "ですか？", "?教えてください", "?教えて"]

SCOPE = "学食・電車・課題・教室の状況"
REFUSAL = f"ごめんなさい、私は{SCOPE}のことだけお答えできます。"
GREET_A = [f"こんにちは！{SCOPE}のことなら何でも聞いてください。", f"こんにちは！今日は何を調べますか？{SCOPE}に答えられますよ。"]
THANKS_A = ["どういたしまして！他にも聞きたいことがあればどうぞ。", "お役に立てて良かったです！"]
BYE_A = ["さようなら！また聞きたいことがあればいつでもどうぞ。", "またね！気をつけて帰ってください。"]
HELP_A = ["私はCampus Syncのアシスタントです。学食のメニュー・混雑・売り切れ、鷹の台駅の電車、課題の期限、教室の状況についてお答えできます。"]
NF_MENU = "その名前のメニューは見つかりませんでした。「今日のメニューは?」と聞くと一覧を出せますよ。"
NF_TASK = "その課題は見つかりませんでした。「課題ある?」と聞くと一覧を出せますよ。"
NF_ROOM = "その教室は見つかりませんでした。「教室の状況は?」と聞くと一覧を出せますよ。"
FIXED = {"greet": GREET_A, "thanks": THANKS_A, "bye": BYE_A, "help": HELP_A, "off": [REFUSAL],
         "nf_menu": [NF_MENU], "nf_task": [NF_TASK], "nf_room": [NF_ROOM]}

OFF = ["天気は", "好きな食べ物は", "宿題を代わりにやって", "今何時", "おすすめの本は", "彼女できる", "テストの答えを教えて", "明日の天気", "数学の問題を解いて",
       "バスの時間は", "図書館の本は", "落とし物ある", "部活の予定は", "先生の連絡先は", "面白い話して", "ゲームしよう", "学校の場所は", "ニュースを教えて",
       "今日は何曜日", "おすすめの映画は", "時間割を教えて", "明日は休み", "今日の天気は", "好きな色は", "あなたは何歳"]
GREET_Q = ["こんにちは", "おはよう", "こんばんは", "やあ", "はじめまして", "hello", "おはようございます", "こんにちは！"]
THANKS_Q = ["ありがとう", "ありがとうございます", "助かった", "感謝", "サンキュー", "ありがと！"]
BYE_Q = ["さようなら", "バイバイ", "またね", "ばいばい", "じゃあね", "失礼します", "おやすみ", "さよなら"]
HELP_Q = ["何ができる", "使い方を教えて", "ヘルプ", "どんなこと聞ける", "あなたは誰", "自己紹介して", "何を聞けばいい"]

# 評価で「言い回しが違ってもここは同じはず」という目印(ref と gen で有無が一致するか見る)
PHRASES = ["最後", "その次", "もうありません", "ありません", "売り切れていません", "売り切れです", "分後", "本目", "見つかりません", "登録されていません", "投票がまだ"]


def rnd_name(kind):
    if kind == "room": return random.choice(ROOMS)
    return random.choice(FOODS) + random.choice(["ランチ", "セット", ""]) if kind == "menu" else random.choice(SUBJ) + random.choice(KIND)


def dress(q, noisy=True):
    """言い回しの揺れ・未知文字を加える。"""
    q = q.rstrip("?？")
    if not noisy:
        return q + "?"
    q = random.choice(PREFIX) + q + random.choice(SUFFIX)
    if random.random() < 0.08 and len(q) > 4:
        # スロット({TN}など)の中は壊さない
        inside, ok = False, []
        for j, c in enumerate(q):
            if c == "{": inside = True
            if not inside: ok.append(j)
            if c == "}": inside = False
        if ok:
            i = random.choice(ok); q = q[:i] + NOISE_CHAR + q[i + 1:]
    return q


def situation(nm, ka, kb, nj, room, d, tgt, vote, sold):
    """room = "あり" | "なし" """
    return f"学食{nm}件 国分寺{ka}件 東村山{kb}件 課題{nj}件 教室{room} 方面{d} 対象{tgt} 投票{vote} 売切{sold}"


def fmt_prompt(sit, q):
    return f"【状況】{sit}\n【質問】{q}\n【回答】"


def _c3():
    return random.choice([0, 1, 2, 2, 3, 3])


def _dir_part(label, n, vals, kind):
    """「両方」の回答の1方面ぶん。vals: スロット名の辞書。0本なら『ありません系』。"""
    if kind == "train":
        return f"{label}は本日もうありません" if n == 0 else f"{label}は{{{vals['H']}}}発の{{{vals['S']}}}です"
    if kind == "eta":
        return f"{label}は本日もうありません" if n == 0 else f"{label}は{{{vals['M']}}}分後（{{{vals['H']}}}発）です"
    raise ValueError(kind)


def sample(noisy=True):
    """返り値: (状況, 質問, 回答, 種類)"""
    nm, nj = random.choice([0, 1, 2, 3, 3, 4, 4]), random.choice([0, 1, 1, 2, 3, 3])
    ka, kb, room = _c3(), _c3(), random.choice(["あり", "あり", "なし"])
    d = random.choice(DIRS); vote = random.choice(["あり", "あり", "なし"]); sold = "なし"
    kinds = ["menu", "kcal", "alg", "info", "nf_menu", "train", "eta", "nth", "tasks", "due", "nf_task", "soldout", "soldlist", "crowd",
             "room_all", "room_one", "nf_room", "greet", "thanks", "bye", "help", "off"]
    wts = [3, 2, 2, 1, 1.5, 4, 1.5, 1.5, 3, 2, 1, 1.5, 1, 1.5, 1.5, 1.5, 1, 1, 1, 1, 1, 2.5]
    k = random.choices(kinds, wts)[0]
    tgt = "なし"; a = None

    # 電車系: 方面を言うか(70%)。言わなければ「両方」
    qd = None
    if k in ("train", "eta", "nth"):
        if random.random() < 0.65: qd = random.choice(DIRS)
        d = qd or "両方"
    cnt = ka if d == "国分寺方面" else kb

    if k == "menu":
        q = random.choice(["今日のメニューは", "学食のメニュー教えて", "今日の学食何がある", "学食って何食べられる", "メニューを教えて", "今日のランチは", "ご飯何がある"])
        if nm == 0:
            a = "今日はまだ学食のメニューが登録されていません。"
        else:
            names = "、".join(f"{{N{i}}}" for i in range(1, nm + 1))
            a = random.choice([f"今日のメニューは{names}です。", f"今日は{names}があります。"])
    elif k in ("kcal", "alg", "info"):
        nm = max(nm, 1); tgt = "学食"
        if k == "kcal":
            q = random.choice(["{TN}のカロリーは", "{TN}は何kcal", "{TN}って何キロカロリー", "{TN}のカロリー教えて"])
            a = random.choice(["{TN}は{TK}です。", "{TN}のカロリーは{TK}です。"])
        elif k == "alg":
            q = random.choice(["{TN}のアレルギーは", "{TN}に含まれるアレルゲンは", "{TN}って何のアレルギーある", "{TN}のアレルギー教えて"])
            a = random.choice(["{TN}には{TA}が含まれます。", "{TN}のアレルギー表示は{TA}です。"])
        else:
            q = random.choice(["{TN}について教えて", "{TN}ってどんなメニュー"])
            a = "{TN}は{TK}で、{TA}が含まれます。"
    elif k == "nf_menu":
        q = rnd_name("menu") + random.choice(["のカロリーは", "のアレルギーは", "について教えて", "は売り切れてる"]); a = NF_MENU
    elif k == "soldout":
        nm = max(nm, 1); tgt = "学食"; sold = random.choice(["あり", "なし"])
        q = random.choice(["{TN}は売り切れてる", "{TN}って売り切れ", "{TN}はまだある", "{TN}売り切れた"])
        a = random.choice(["{TN}は売り切れです。", "{TN}は残念ながら売り切れです。"]) if sold == "あり" else \
            random.choice(["{TN}はまだ売り切れていません。", "{TN}は売り切れていません。まだ食べられますよ。"])
    elif k == "soldlist":
        sold = random.choice(["あり", "なし"])
        q = random.choice(["売り切れのメニューある", "売り切れてるのは", "今売り切れのものは", "売り切れ教えて", "売り切れてるメニューは"])
        a = "売り切れのメニューは{SL}です。" if sold == "あり" else "今、売り切れのメニューはありません。"
    elif k == "crowd":
        q = random.choice(["食堂の混み具合は", "学食混んでる", "今の食堂の混雑は", "学食空いてる", "食堂の混雑状況教えて", "食堂は混んでますか"])
        a = "今の学食の混み具合は「{CR}」です（投票{CN}件）。" if vote == "あり" else "混雑の投票がまだありません。"
    elif k == "room_all":
        q = random.choice(["教室の状況は", "教室の温度は", "教室の様子教えて", "今の教室の暑い寒い", "教室の気温は", "教室の状況を教えて", "各教室の温度は", "どの教室が暑い"])
        a = "教室の状況はまだ登録されていません。" if room == "なし" else random.choice(["教室の状況は{RL}です。", "いまの教室の状況は{RL}です。"])
    elif k == "room_one":
        room = "あり"; tgt = "教室"
        q = random.choice(["{TR}の気温は", "{TR}は暑い", "{TR}の状況は", "{TR}の温度は", "{TR}寒い", "{TR}の様子は"])
        a = random.choice(["{TR}は{TS}です。", "いまの{TR}は{TS}です。"])
    elif k == "nf_room":
        q = rnd_name("room") + random.choice(["の気温は", "の状況は", "の温度は", "は暑い"]); a = NF_ROOM
    elif k == "train":
        base = random.choice(["{D}の次の電車は", "{D}はいつ来る", "{D}の電車教えて", "次の{D}の電車は何時", "{D}って何時発"]) if qd else random.choice(["次の電車は", "電車何時", "次の電車いつ", "駅の電車教えて", "電車教えて"])
        q = base.replace("{D}", qd or "")
        if qd:
            if cnt == 0: a = f"{d}の本日の電車はもうありません。"
            elif cnt == 1: a = random.choice([f"次の{d}は{{H1}}発の{{S1}}です。これが今日の最後の電車です。", f"{d}の次の電車は{{H1}}発、{{S1}}です。今日はこれが最後です。"])
            else: a = random.choice([f"次の{d}は{{H1}}発の{{S1}}です。その次は{{H2}}発です。", f"{d}の次の電車は{{H1}}発、{{S1}}です。その次は{{H2}}発です。"])
        else:
            a = "。".join([_dir_part("国分寺方面", ka, dict(H="H1", S="S1"), "train"), _dir_part("東村山方面", kb, dict(H="EH1", S="ES1"), "train")]) + "。"
    elif k == "eta":
        base = random.choice(["{D}の次の電車は何分後", "{D}の電車まであと何分", "{D}はあと何分"]) if qd else random.choice(["次の電車は何分後", "電車あと何分", "次の電車まであと何分", "何分後に電車来る"])
        q = base.replace("{D}", qd or "")
        if qd:
            a = f"{d}の本日の電車はもうありません。" if cnt == 0 else f"次の{d}は{{M1}}分後、{{H1}}発の{{S1}}です。"
        else:
            a = "。".join([_dir_part("国分寺方面", ka, dict(H="H1", M="M1"), "eta"), _dir_part("東村山方面", kb, dict(H="EH1", M="EM1"), "eta")]) + "。"
    elif k == "nth":
        n = random.choice([2, 3]); qn = random.choice([str(n), "二三"[n - 2]])
        base = random.choice([f"{qn}本後の{{D}}電車は何時", f"{{D}}の{qn}本目は何時", f"{qn}本目の{{D}}電車は"])
        q = base.replace("{D}の", f"{qd}の" if qd else "").replace("{D}", qd or "")
        if qd:
            a = f"{d}の{n}本目は{{H{n}}}発の{{S{n}}}です。" if cnt >= n else f"{d}の{n}本目の電車はありません。"
        else:
            pk = f"国分寺方面の{n}本目は{{H{n}}}発です" if ka >= n else f"国分寺方面の{n}本目はありません"
            pe = f"東村山方面の{n}本目は{{EH{n}}}発です" if kb >= n else f"東村山方面の{n}本目はありません"
            a = pk + "。" + pe + "。"
    elif k == "tasks":
        q = random.choice(["今日の課題は", "課題ある", "出てる課題教えて", "やることを教えて", "提出するものある", "宿題ある", "課題を教えて", "今ある課題は"])
        if nj == 0: a = "現在出ている課題はありません。"
        else:
            body = "、".join(f"{{J{i}}}（期限：{{D{i}}}）" for i in range(1, nj + 1))
            a = random.choice([f"現在の課題は{body}です。", f"出ている課題は{body}です。"]) if nj > 1 else f"現在の課題は{body}の1件です。"
    elif k == "due":
        nj = max(nj, 1); tgt = "課題"
        q = random.choice(["{TJ}の期限は", "{TJ}はいつまで", "{TJ}の提出期限を教えて"])
        a = random.choice(["{TJ}の期限は{TJ_D}です。".replace("{TJ_D}", "{TD}"), "{TJ}の提出期限は{TD}です。"])
    elif k == "nf_task":
        q = rnd_name("task") + random.choice(["の期限は", "はいつまで", "の提出期限を教えて"]); a = NF_TASK
    else:
        pool = {"greet": GREET_Q, "thanks": THANKS_Q, "bye": BYE_Q, "help": HELP_Q, "off": OFF}[k]
        q = random.choice(pool); a = random.choice(FIXED[k])
    return situation(nm, ka, kb, nj, room, d, tgt, vote, sold), dress(q, noisy), a, k


def make_dataset(n, seed=0, noisy=True):
    random.seed(seed)
    out = []
    for _ in range(n):
        sit, q, a, k = sample(noisy)
        out.append((fmt_prompt(sit, q), a, k))
    return out


def check(kind, gen, ref):
    """評価: 生成した文の型 gen が正解 ref と(言い回しの違いを除いて)同じか。"""
    import re
    if kind in FIXED: return gen in FIXED[kind]
    sl = lambda s: re.findall(r"\{\w+\}", s)
    dr = lambda s: re.findall(r"(?:国分寺|東村山)方面", s)
    return sl(gen) == sl(ref) and dr(gen) == dr(ref) and all((w in gen) == (w in ref) for w in PHRASES)


if __name__ == "__main__":
    for p, a, k in make_dataset(8, 3):
        print(p + a + "\n--- " + k)
