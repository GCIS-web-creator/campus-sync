# CampusSync アセット第2弾

前回のアイコン22点とロゴに続く、CampusSync用の素材セットです。

| フォルダ | 中身 |
|---|---|
| `favicon-and-app/` | ファビコン、ホーム画面アイコン、PWA用manifest |
| `ogp/` | SNSで共有した時に出る画像(1200×630) |
| `animated/` | 動くアイコン8点 |
| `illustrations/` | 「まだ何もない」「エラー」の時に出すイラスト8点 |
| `rank-badges/` | 貢献度ランクのメダル5点と、ランク判定の `ranks.ts` |
| `status-icons/` | 学食の混雑3段階、エアコンの寒い・快適・暑い |
| `tools/` | 作り直し用のスクリプト |

`preview.png` に全体の一覧があります。

---

## 1. ファビコンとアプリアイコン(`favicon-and-app/`)

| ファイル | 用途 |
|---|---|
| `favicon.ico` / `favicon.svg` / `favicon-16/32/48.png` | ブラウザのタブ |
| `apple-touch-icon.png` (180px) | iPhoneのホーム画面に追加した時 |
| `icon-192.png` / `icon-512.png` | Androidやインストール型Webアプリ |
| `icon-maskable-192.png` / `icon-maskable-512.png` | Androidが丸や角丸に切り抜く用(余白を多めに取ってあります) |
| `icon-any.svg` / `icon-maskable.svg` | 上の元になるSVG |
| `site.webmanifest` | ホーム画面追加の設定(名前、テーマ色、アイコン) |
| `layout-metadata.example.tsx` | `app/layout.tsx` に貼る設定例 |

### 置き方(Next.js App Router)

1. `favicon.ico`、`favicon.svg`、`apple-touch-icon.png`、`site.webmanifest`、`og-image.png` を `public/` にコピーします。
2. `icon-192.png`、`icon-512.png`、`icon-maskable-192.png`、`icon-maskable-512.png` を `public/icons/` にコピーします(`site.webmanifest` がこのパスを指しています)。
3. `layout-metadata.example.tsx` の中身を `app/layout.tsx` に追記します。`layout.tsx` が `'use client'` になっていると `metadata` は使えないので、その時は `<head>` に `<link>` を書いてください。

アイコンは、青い角丸の地に白い角帽、金色の房、きらめきの組み合わせです。16pxでも角帽の形が読み取れるように、ロゴより単純にしてあります。

## 2. OGP画像(`ogp/`)

`og-image.png`(1200×630)は、LINE、X、Slackなどでリンクを貼った時に出る画像です。`og-image.svg` が元データです。

文字は「学校生活を、ひとつにつなぐ。」「時間割・学食・電車・落とし物・通知」にしてあります。**キャッチコピーは私が考えた仮のものです**。変えたい時は `tools/build_brand.py` の `L1` と `L2` を書き換えて、作り直してください。

## 3. 動くアイコン(`animated/`)

CSSアニメーション入りのSVGです。`<img src="...">` で読み込んでも動きます。

| ファイル | 動き | 使いどころの例 |
|---|---|---|
| `loading-logo.svg` | 角帽がふわふわ浮き、房が揺れ、きらめく。下に3つのドットが順に光る | 読み込み中の画面(縦長 24×30) |
| `bell-ring.svg` | ベルが揺れ、赤いバッジが跳ねる | 未読の通知があるとき |
| `train-move.svg` | ヘッドライトが光り、線路が流れる | 電車発車案内のヘッダー |
| `cafeteria-steam.svg` | 丼から湯気が立つ | 学食タブのヘッダー |
| `aircon-wind.svg` | 風が流れ、ランプが点滅する | 校内施設のエアコン報告 |
| `qr-scan.svg` | 走査線が上下に動く | QRログインの表示 |
| `trophy-shine.svg` | トロフィーが光り、星がきらめく | 貢献度ポイントが増えた時 |
| `lost-found-search.svg` | 虫眼鏡が左右に揺れる | 落とし物を探している時 |

- 元のサイズは24px基準です。`className="h-16 w-16"` のように大きさを指定してください。
- OSの設定が「視差効果を減らす」の人には、自動的に動きを止めます(`prefers-reduced-motion`)。
- アニメーションは動いたまま止まりません。表示し続けると目障りなので、読み込みが終わったら消す、などの使い方を想定しています。

```tsx
{loading && <img src="/animated/loading-logo.svg" alt="読み込み中" className="mx-auto h-20 w-16" />}
```

## 4. イラスト(`illustrations/`)

240×200の読み込み専用イラストです。文字は入れていないので、キャプションはアプリ側で付けてください。

| ファイル | 使う場面 | キャプション例 |
|---|---|---|
| `empty-lost-found.svg` | 落とし物がない | 共有された落とし物はまだありません。 |
| `empty-notifications.svg` | 通知がない | 新しい通知はありません |
| `empty-todo-done.svg` | 課題がすべて完了 | 課題はすべて完了!おつかれさま |
| `empty-reviews.svg` | 口コミがない | まだ口コミがありません |
| `empty-club-note.svg` | 部活・委員会の連絡がない | 連絡はまだありません |
| `empty-no-class.svg` | 授業のない日 | 今日は授業がありません |
| `empty-library-search.svg` | 蔵書検索で見つからない | タイトルまたは著者名を変えて検索してください。 |
| `error-offline.svg` | 通信エラー | ネットワークに接続できません |

```tsx
<div className="py-8 text-center">
  <img src="/illustrations/empty-lost-found.svg" alt="" className="mx-auto w-48" />
  <p className="mt-2 text-sm font-bold text-gray-500">共有された落とし物はまだありません。</p>
</div>
```

背景の淡い色は透明度つきなので、ライト/ダークどちらでも使えます。

## 5. ランクのメダル(`rank-badges/`)

貢献度ポイントに応じたメダルです。ブロンズ、シルバー、ゴールド、プラチナ、ダイヤモンドの5種類で、ランクが上がるほどメダルの縁の星が増えます。サイズは64×72です。

`page.tsx` の貢献度は `Math.max(0, Math.min(prev + delta, 100))` で**0〜100に収まる**ので、境目もその範囲で決めてあります。

| ランク | スコア |
|---|---|
| ブロンズ | 0〜29 |
| シルバー | 30〜49 |
| ゴールド | 50〜69 |
| プラチナ | 70〜89 |
| ダイヤモンド | 90〜100 |

初期スコアの65は「ゴールド」になります。**境目は仮の値です**。`ranks.ts` の `min` を変えれば調整できます。

```tsx
import { getRank, getNextRank } from '@/lib/ranks';

const rank = getRank(score);
const next = getNextRank(score);

<img src={rank.src} alt={rank.label} className="h-16" />
<p>{rank.label}{next && `(あと${next.remaining}ptで${next.rank.label})`}</p>
```

## 6. 状態アイコン(`status-icons/`)

| ファイル | 意味 | 色 |
|---|---|---|
| `crowd-empty.svg` | 空いていて快適 | 緑 |
| `crowd-normal.svg` | 通常の混み具合 | オレンジ |
| `crowd-crowded.svg` | 大変混雑している | 赤 |
| `ac-cold.svg` | エアコン:寒い | 青 + 雪の結晶 |
| `ac-comfy.svg` | エアコン:快適 | 緑 + チェック |
| `ac-hot.svg` | エアコン:暑い | 赤 + 太陽 |

混雑の3色は、`page.tsx` の学食 `VoteBar`(緑・オレンジ・赤)と同じにしてあります。`status.ts` に、投票の値(`empty` / `normal` / `crowded`)やエアコンの状態(`寒い` / `快適` / `暑い`)とファイルを結びつける対応表があります。

```tsx
import { CROWD_ICONS } from '@/lib/status';
<img src={CROWD_ICONS[vote].src} alt={CROWD_ICONS[vote].label} className="h-8 w-8" />
```

## 作り直し(`tools/`)

色や文言を変えたい時のスクリプトです。

```
pip install fonttools uharfbuzz cairosvg pillow playwright
python3 build_all.py
```

- 出力は `tools/pkg/campussync-assets/` に作られます。
- OGP画像の日本語は **Noto Sans JP**(SIL OFL)を使うので、`NotoSansJP.ttf`(可変フォント)を `tools/` に置く必要があります。https://github.com/google/fonts/tree/main/ofl/notosansjp から取得できます。サイズが大きいので、このZIPには入れていません。
- OGP PNGの書き出しにはPlaywrightのChromiumを使います。

## ライセンス

CampusSync のために作成したオリジナルです。サイト内での使用、改変、配布に制限はありません。OGP画像の文字は Noto Sans JP(Adobe / Google、SIL Open Font License 1.1)、ロゴの文字は Poppins(SIL OFL 1.1)をもとにした図形です。
