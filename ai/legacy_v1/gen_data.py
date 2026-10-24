"""Campus Sync 専用AI の学習データ生成(スロット方式)。
モデルは「値を含まない文の型」だけを生成する。{N1}{K1}{H1} などのスロットはアプリがDBの値で埋める。
モデルが見る情報: 状況(各データの件数・電車の方面・質問が指す対象の種類) + 質問。
"""
import random

DIRS = ["国分寺方面", "東村山方面"]
FOODS = ["カレー", "ラーメン", "うどん", "そば", "丼", "定食", "パスタ", "オムライス", "ハンバーグ", "唐揚げ", "天ぷら", "焼きそば", "チャーハン"]
SUBJ = ["数学", "英語", "国語", "物理", "化学", "生物", "日本史", "世界史", "地理", "情報", "古典", "現代文"]
KIND = ["小テスト", "レポート", "ワーク", "プリント", "提出物", "宿題"]
NOISE_CHAR = "☃"  # 未知文字のふり

PREFIX = ["", "", "", "", "ねえ、", "すみません、", "あの、", "ちょっと聞きたいんだけど、", "教えて、"]
SUFFIX = ["?", "?", "？", "", "かな?", "かな？", "ですか?", "ですか？", "?教えてください", "?教えて"]

REFUSAL = "ごめんなさい、私は学食・電車・課題のことだけお答えできます。"
GREET_A = ["こんにちは！学食・電車・課題のことなら何でも聞いてください。", "こんにちは！今日は何を調べますか？学食・電車・課題に答えられますよ。"]
THANKS_A = ["どういたしまして！他にも聞きたいことがあればどうぞ。", "お役に立てて良かったです！"]
HELP_A = ["私はCampus Syncのアシスタントです。学食のメニュー、鷹の台駅の電車、課題の期限についてお答えできます。"]
NF_MENU = "その名前のメニューは見つかりませんでした。「今日のメニューは?」と聞くと一覧を出せますよ。"
NF_TASK = "その課題は見つかりませんでした。「課題ある?」と聞くと一覧を出せますよ。"
FIXED = {"greet": GREET_A, "thanks": THANKS_A, "help": HELP_A, "off": [REFUSAL], "nf_menu": [NF_MENU], "nf_task": [NF_TASK]}

OFF = ["天気は", "好きな食べ物は", "宿題を代わりにやって", "今何時", "おすすめの本は", "彼女できる", "テストの答えを教えて", "明日の天気", "数学の問題を解いて", "バスの時間は", "図書館の本は", "落とし物ある", "部活の予定は", "先生の連絡先は", "面白い話して", "ゲームしよう", "学校の場所は", "ニュースを教えて"]
GREET_Q = ["こんにちは", "おはよう", "こんばんは", "やあ", "はじめまして", "hello", "おはようございます", "こんにちは！"]
THANKS_Q = ["ありがとう", "ありがとうございます", "助かった", "感謝", "サンキュー", "ありがと！"]
HELP_Q = ["何ができる", "使い方を教えて", "ヘルプ", "どんなこと聞ける", "あなたは誰", "自己紹介して", "何を聞けばいい"]


def rnd_name(kind):
    return random.choice(FOODS) + random.choice(["ランチ", "セット", ""]) if kind == "menu" else random.choice(SUBJ) + random.choice(KIND)


def dress(q, noisy=True):
    """言い回しの揺れ・未知文字を加える。"""
    q = q.rstrip("?？")
    if not noisy:
        return q + "?"
    q = random.choice(PREFIX) + q + random.choice(SUFFIX)
    if random.random() < 0.08 and len(q) > 4:
        i = random.randrange(len(q)); q = q[:i] + NOISE_CHAR + q[i + 1:]
    return q


def situation(nm, nt, nj, d, tgt):
    return f"学食{nm}件 電車{nt}件 課題{nj}件 方面{d} 対象{tgt}"


def fmt_prompt(sit, q):
    return f"【状況】{sit}\n【質問】{q}\n【回答】"


def sample(noisy=True):
    """返り値: (状況, 質問, 回答, 種類)"""
    nm, nt, nj = random.choice([0, 1, 2, 3, 3, 4, 4]), random.choice([0, 1, 2, 2]), random.choice([0, 1, 1, 2, 3, 3])
    d = random.choice(DIRS)
    k = random.choices(["menu", "kcal", "alg", "info", "nf_menu", "train", "tasks", "due", "nf_task", "greet", "thanks", "help", "off"],
                       [3, 2, 2, 1, 1.5, 4, 3, 2, 1, 1, 1, 1, 2])[0]
    tgt = "なし"; a = None

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
        q = rnd_name("menu") + random.choice(["のカロリーは", "のアレルギーは", "について教えて"]); a = NF_MENU
    elif k == "train":
        qd = random.choice(DIRS) if random.random() < 0.7 else None
        if qd: d = qd
        base = random.choice(["{D}の次の電車は", "{D}はいつ来る", "{D}の電車教えて", "次の{D}の電車は何時", "{D}って何時発"]) if qd else random.choice(["次の電車は", "電車何時", "次の電車いつ", "駅の電車教えて"])
        q = base.replace("{D}", qd or "")
        if nt == 0: a = f"{d}の本日の電車はもうありません。"
        elif nt == 1: a = random.choice([f"次の{d}は{{H1}}発の{{S1}}です。これが今日の最後の電車です。", f"{d}の次の電車は{{H1}}発、{{S1}}です。今日はこれが最後です。"])
        else: a = random.choice([f"次の{d}は{{H1}}発の{{S1}}です。その次は{{H2}}発です。", f"{d}の次の電車は{{H1}}発、{{S1}}です。その次は{{H2}}発です。"])
    elif k == "tasks":
        q = random.choice(["今日の課題は", "課題ある", "出てる課題教えて", "やることを教えて", "提出するものある", "宿題ある", "課題を教えて"])
        if nj == 0: a = "現在出ている課題はありません。"
        else:
            body = "、".join(f"{{J{i}}}（期限：{{D{i}}}）" for i in range(1, nj + 1))
            a = random.choice([f"現在の課題は{body}です。", f"出ている課題は{body}です。"]) if nj > 1 else f"現在の課題は{body}の1件です。"
    elif k == "due":
        nj = max(nj, 1); tgt = "課題"
        q = random.choice(["{TJ}の期限は", "{TJ}はいつまで", "{TJ}の提出期限を教えて"])
        a = random.choice(["{TJ}の期限は{TD}です。", "{TJ}の提出期限は{TD}です。"])
    elif k == "nf_task":
        q = rnd_name("task") + random.choice(["の期限は", "はいつまで", "の提出期限を教えて"]); a = NF_TASK
    else:
        pool = {"greet": GREET_Q, "thanks": THANKS_Q, "help": HELP_Q, "off": OFF}[k]
        q = random.choice(pool)
        a = random.choice({"greet": GREET_A, "thanks": THANKS_A, "help": HELP_A, "off": [REFUSAL]}[k])
        k_ = k
    return situation(nm, nt, nj, d, tgt), dress(q, noisy), a, k


def make_dataset(n, seed=0, noisy=True):
    random.seed(seed)
    out = []
    for _ in range(n):
        sit, q, a, k = sample(noisy)
        out.append((fmt_prompt(sit, q), a, k))
    return out


if __name__ == "__main__":
    for p, a, k in make_dataset(5, 3):
        print(p + a + "\n--- " + k)
