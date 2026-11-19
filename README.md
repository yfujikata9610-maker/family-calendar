# 家族カレンダー

2人で共有するカレンダー＋メモ（自由メモ／チェックリスト）＋リマインド通知のiPhone向けWebアプリ（PWA）。

- 色分け：青＝自分、ピンク＝相手、黄色＝共通
- 変更は相手の画面にすぐ反映（Supabase Realtime）
- 費用：Supabase無料プラン＋GitHub Pages（無料）

## ファイル

| ファイル | 内容 |
|---|---|
| `index.html` | アプリ本体 |
| `config.js` | Supabaseの接続設定（空ならデモモード） |
| `sw.js` / `manifest.webmanifest` / `*.png` | ホーム画面追加・通知用 |
| `supabase/01_schema.sql` | データベース定義（SQL Editorで1回実行） |
| `supabase/functions/send-reminders/index.ts` | リマインド通知を送る関数 |
| `supabase/02_cron.sql` | 1分ごとの通知チェック（関数デプロイ後に実行） |
| `supabase/03_new_event_trigger.sql` | 相手が予定を追加したときの通知（関数デプロイ後に実行） |
| `vendor/` | Supabaseライブラリ（npm公式配布物 2.45.4 をそのまま同梱） |

アプリを更新したら `sw.js` の `CACHE` の番号を上げる（iPhone側は「次に開いたとき」に新しい版になる）。

## デモモードで試す

`index.html` をブラウザで開くだけ。データはそのブラウザ内だけに保存されます。
同じブラウザで2つのタブを開くと、同期の様子を確認できます。「設定」タブで表示する人（青／ピンク）を切り替えられます。

## 本番の準備（概要）

1. Supabaseでプロジェクトを作成
2. SQL Editorで `supabase/01_schema.sql` を実行
3. Authentication → 新規登録を無効化し、2人のユーザーを手動で作成
4. VAPID鍵を作成し、Edge Function `send-reminders` をデプロイ（Verify JWT はオフ）。シークレットを設定
5. `supabase/02_cron.sql` の2か所を置き換えて実行
6. `config.js` にURL・anonキー・VAPID公開鍵を記入
7. GitHub Pagesで公開 → iPhoneのSafariで開いて「ホーム画面に追加」→ 設定タブで通知をオン

## 注意

- iPhoneの通知は iOS 16.4 以上、かつホーム画面に追加したアプリでのみ届きます。
- Supabase無料プロジェクトは1週間使われないと一時停止します（管理画面から再開可能）。
- メモを2人が同時に編集した場合は、後から保存した方の内容が残ります。
