# 生徒プロフィール初回設定・.cslogson 書き出し手順

## 1. Supabase の準備

Supabase Dashboard の **SQL Editor** で、リポジトリにある `supabase/student-profile-setup.sql` の内容を確認して実行します。このSQLはプロフィールの初回設定状態、認証済みユーザーとの関連付けに使う列、および本人用ポリシーを準備します。

実行前後に、`public.profiles` に既存のRLSポリシーがある場合は必ず確認してください。Supabase の permissive ポリシーは通常 OR で評価されるため、このSQLで本人用ポリシーを追加しても、既存の「全員にSELECTを許可する」ポリシーなどが自動的に無効になるわけではありません。用途を確認して、他人のプロフィールを読める広すぎるポリシーが残っていないことを確認します。

確認用SQL:

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;
```

## 2. Vercel の環境変数

Vercel Dashboard のプロジェクト → **Settings → Environment Variables** で、必要な値を設定します。

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase プロジェクト URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase のサーバー専用 service-role key。**`NEXT_PUBLIC_` を付けず、クライアントへ絶対に渡さない**
- `CAMPUS_SYNC_ADMIN_PASSWORD`: 既存の管理APIで使用する管理用パスワード
- `STUDENT_PROFILE_EXPORT_PASSWORD`: 生徒プロフィールの書き出し専用の確認シークレット。管理用パスワードとは別の、十分に長い新しい値を設定する

確認シークレットをソースコード、GitHub、URL、書き出しファイルに入れないでください。チャットなどで既に共有した文字列をそのまま秘密として使い続けず、専用の新しいシークレットを設定してください。設定を変更したら、対象環境に反映されるよう再デプロイします。

## 3. 初回ログイン

生徒は `6桁の学籍番号@tokyo.soka.ed.jp` の学校メールに送信された確認コードで認証し、初回プロフィール画面で氏名・学年・クラス・パスワードを設定します。2回目以降は学校メールと設定したパスワードでログインできます。

パスワードは Supabase Auth だけで管理されます。`public.profiles` に平文パスワードやパスワードハッシュは保存しません。プロフィール書き出しにも、パスワード、パスワードハッシュ、認証トークンは含まれません。

## 4. Admin からの書き出し

1. Admin の「生徒プロフィール書き出し」を開きます。
2. 管理用パスワードと `STUDENT_PROFILE_EXPORT_PASSWORD` に設定した書き出し確認シークレットを入力します。
3. 個人情報を含むファイルを適切に保管する確認欄にチェックし、書き出します。

ファイルには学籍番号・氏名・学校メール・学年クラス・設定時刻などが含まれるため、アクセス制限された保管場所に置きます。パスワード等の認証情報は書き出しません。SHA-256ハッシュ連鎖はファイル内の変更検出を補助しますが、元のデータベースや作成者の真正性を証明するものではありません。

## 5. 書き出しファイルの検証

ローカル環境で Node.js が使える場合:

```bash
npm run verify:cslogson -- ./campus-sync-student-profiles-YYYY-MM-DD.cslogson
```

チャット監査ログの `.cslogson` も同じ検証スクリプトで確認できます。検証成功はファイル内の形式とハッシュ連鎖が一致したことを示しますが、ファイルが正規のデータベースから出力されたこと自体を証明するものではありません。
