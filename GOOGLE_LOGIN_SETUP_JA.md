# CampusSync Googleログイン設定

CampusSyncの生徒ログインはSupabase AuthのGoogle OAuthを使用します。アプリはGoogleの基本プロフィール・メール確認の範囲（openid email profile）のみを要求し、GmailやDriveなどのデータ権限は要求しません。

## 1. Google Cloud側

1. Google Cloud ConsoleでCampusSync用プロジェクトを選択または作成します。
2. Google Auth Platformでアプリ情報（アプリ名、サポート連絡先、開発者連絡先）を設定します。
3. OAuthクライアントを作成し、種類は「ウェブアプリケーション」にします。
4. 承認済みJavaScript生成元に、本番URLを登録します。
   - `https://campus-sync.gcis-webcreator.workers.dev`
   - ローカル開発を行う場合のみ `http://localhost:3000`
5. 承認済みリダイレクトURIには、SupabaseプロジェクトのAuth callback URLを登録します。
   - `https://sgvhktudhxufluuaipwt.supabase.co/auth/v1/callback`
6. 発行されたClient IDとClient Secretを控えます。

## 2. Supabase側

1. Supabase Dashboardで対象プロジェクトを開き、Authentication → Sign In / Providers → Googleへ進みます。
2. Google providerを有効化し、Client IDとClient Secretを入力して保存します。
3. Authentication → URL ConfigurationでSite URLを本番URLに設定します。
4. Redirect URLsに本番URL（`https://campus-sync.gcis-webcreator.workers.dev/**`）と、必要な場合のみローカルURL（`http://localhost:3000/**`）を登録します。

## 3. 動作と安全性

- Googleログインの画面では `hd=tokyo.soka.ed.jp` をアカウント選択のヒントとして送りますが、これはアクセス制御ではありません。
- 実際の許可判定はアプリ側で行い、メールアドレスが6桁の学籍番号 + `@tokyo.soka.ed.jp` に一致しないログインは拒否してローカルセッションを破棄します。
- 新規ユーザーはGoogle認証後に既存の初回プロフィール登録画面へ進み、氏名・クラスとCampusSync用パスワードを設定します。
- 既存の学校メール＋CampusSyncパスワードのログインは残します。
- Supabase Authは、同じ検証済みメールアドレスを持つOAuth identityを既存ユーザーへ自動リンクします。ただし既存メールが未検証の場合は自動リンクされないことがあります。
- 学校のGoogle Workspace for Educationが外部OAuthアプリを制限している場合、学校管理者によるアプリの許可が必要です。制限は迂回しないでください。

## 4. 秘密情報の取り扱い

Google Client SecretはGitHub、Cloudflareの公開ビルド変数、ブラウザー側のコードには保存しません。Supabase DashboardのGoogle provider設定へ直接入力してください。チャットにも貼らないでください。

このリポジトリのアプリコードはGoogleログインボタンを実装しますが、OAuth providerの有効化・Client ID/Secretの登録・Workspace管理者の許可は管理画面で別途必要です。
