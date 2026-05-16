# App Store提出準備メモ

## 現在の状態

- アプリ名: 期待値トラッカー
- Bundle ID: `com.pastadeteatime.evtracker`
- バージョン: `1.1`
- iOSプロジェクト: `ios/App/App.xcodeproj`
- iPhone 17 Simulator Debugビルド: 成功
- iOS Simulator Releaseビルド: 成功
- iPhone 17 Simulator起動確認: 成功
- App Store向けArchive: Apple Developer Team未設定のため未完了

## App Store用説明文のたたき台

### サブタイトル

パチンコ実戦の期待値・回転率・投資管理

### 説明文

期待値トラッカーは、パチンコ実戦中の投資、回転数、持ち玉、出玉、回転率、期待値を記録するための管理アプリです。

機種ごとの累計、当日の回転ログ、店舗ごとの交換率、持ち玉管理に対応し、実戦中でも素早く入力できるように設計しています。

主な機能:

- 機種ごとの期待値・投資・回転率の記録
- 当日の回転ログ管理
- 店舗ごとの交換率と持ち玉管理
- 回転率チェック
- 累計データ表示
- バックアップと復元

データは端末内に保存されます。バックアップ機能を使うことで、保存データをファイルとして保管できます。

### キーワード候補

期待値,パチンコ,回転率,ボーダー,投資,収支,持ち玉,実戦記録,トラッカー

## プライバシー申告の整理

現時点の実装では、データは主に端末内の保存領域に保存されます。

- アカウント登録: なし
- 外部サーバー送信: なし
- 位置情報: なし
- サポート連絡先: GoogleフォームURLを設定予定
- カメラ/マイク: なし
- 広告SDK: なし
- IDFA/ATTトラッキング: なし

注意:

- アフィリエイトリンクを追加する場合は、リンク先サービス側でデータ取得が行われる可能性があります。
- 広告SDKや解析SDKを追加する場合は、App Store Connectのプライバシー申告を更新する必要があります。
- 初回リリースでは、サブスクリプションやアプリ内課金は導入しません。

## リリース前に必要なもの

- Apple Developer Program登録
- XcodeでApple Developer Teamを選択
- App Store Connectでアプリ作成
- サポートURL
- プライバシーポリシーURL
- サポートページ: `support.html`を追加済み
- プライバシーポリシーページ: `privacy.html`を追加済み
- App Storeスクリーンショット
- アプリ説明文
- キーワード
- 審査メモ
- 実機iPhoneでの動作確認

App Store Connectへ入力する文章は `APP_STORE_CONNECT_DRAFT_JA.md` に整理済みです。

## スクリーンショット候補

1. 機種・店舗・交換率の入力画面
2. 回転ログ入力画面
3. 期待値計算結果画面
4. 機種別累計画面
5. データ管理画面

## 既知の残タスク

- Apple Developer Teamの設定
- App Store向けArchiveの署名確認
- 実機iPhoneでの表示確認
- App Store用スクリーンショット作成
- プライバシーポリシー/サポートページの公開先URL決定

## 登録反映待ち中にできること

- App Store Connect入力内容の確認
- GitHub Pagesなどで `privacy.html` と `support.html` を公開する準備
- App Storeスクリーンショット構成の確認
- 実機確認時に試す操作リストの作成
