# CampusSync 変更差分（通知音・イントロ・お気に入り教室・電車カウントダウン）

この差分は、会話で確認できた CampusSync の `app/page.tsx` と `public/sw.js` に対して作成しています。現在のリポジトリが別バージョンの場合は、まず `git apply --check` で適用可能か確認してください。

## 変更内容

- 標準Web通知の通知音を無音指定せず、OS・ブラウザーの標準設定に従わせる（アプリ側からマナーモードの検出や強制解除はしません）。
- イントロはインストール済みアプリ/PWAとして起動したときだけ、同じ起動セッションで1回だけ表示。通常のブラウザー表示や画面遷移では再表示しない。
- お気に入り教室に「普通教室（在籍クラス）」を追加し、既定のお気に入りにする。プロフィール取得後は `普通教室（2-3）` のように実際のクラス名に合わせる。
- 電車の残り時間を秒単位で更新する。時刻表は分単位なので、秒は予定時刻を分の先頭（秒=00）と仮定した端末時計によるカウントダウンです。リアルタイム運行情報ではありません。

## 適用手順（Codespacesターミナル）

1. ZIP内の `campussync_requested_changes.patch` をリポジトリのルートに置きます。
2. まず確認：

   ```bash
   git apply --check campussync_requested_changes.patch
   ```

3. `check` が成功した場合だけ適用：

   ```bash
   git apply campussync_requested_changes.patch
   ```

4. 差分確認とビルド：

   ```bash
   git diff --check && npm run build
   ```

5. 問題なければGitに保存：

   ```bash
   git add app/page.tsx public/sw.js && git commit -m "Improve app intro, classroom default, and train countdown" && git push origin main
   ```

`git apply --check` が失敗した場合は、`git apply` を実行せず、現在の `app/page.tsx` を確認してから差分を調整してください。
