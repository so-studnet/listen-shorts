@AGENTS.md

# ListenShorts

短い英語動画（YouTube の埋め込み）を見て、聞き取りクイズを解く英語学習アプリ。利用者は So の1人だけで、主な端末は iPhone。

## ドキュメント

- `docs/requirements.md`：要件（機能 F1〜F8、ゲームの数値、決定済みと未確認の点）
- `docs/architecture.md`：技術構成、データモデル、設計のポイント、ディレクトリ構成
- `docs/roadmap.md`：マイルストーンと状態
- `docs/pack-format.md`：クリップパック（JSON）の形式と検証ルール。パックを作るチャットに渡す
- 仕様や実装を変えたら、該当するドキュメントも同じコミットで直す

## 開発ルール

- 判定・得点・コンボ・レベル・バッジ・復習・パックの検証・集計は `src/lib/domain/` の純粋関数にし、Vitest でテストする。現在時刻は引数で受け取る
- ゲームの数値は `src/lib/domain/constants.ts` にまとめる。コードの中に数値を直接書かない
- 保存先は `AppStore` インターフェースの裏に隠す（ログインなしは localStorage、ログインすると Supabase）。localStorage のキーには版を付ける（`listen-shorts:v1:...`）
- Supabase の表は `ls_` で始める（作業記録アプリなどと同じプロジェクト）。RLS は必須。マイグレーションは `supabase/migrations/` に足し、`npm run test:db` を通してから適用する
- 日時は UTC の ISO 文字列で保存し、表示と日付の区切り（午前4時）は端末のタイムゾーンで計算する
- 画面の文言は日本語。スマホ幅（375px）を基準にし、主なボタンは高さ 48px 以上、入力欄の文字は 16px 以上
- YouTube は公式の埋め込みプレーヤーで再生するだけ。字幕の取得や音声のダウンロードはしない
- **本物のクリップパックはコミットしない**（リポジトリは公開）。開発用は `src/data/sample-pack.json`（架空の英文）だけ
- 秘密の値（Supabase の Secret key など）を会話に貼ってもらわない。コードやドキュメントにも書かない
- 確かめていないことは「未確認」と書く

## コミット前のチェック

```bash
npm run check   # テスト・lint・型チェック・DB テスト・本番ビルド（PostgreSQL がなければ SKIP_DB=1）
npm run e2e     # Playwright（スマホ幅、偽の YouTube プレーヤー、偽の Supabase）
```

画面を変えたら、Playwright でスマホ幅で操作し、スクリーンショットで確かめてから報告する。

## So とのやりとり

- So の PC は Windows（PowerShell）、スマホは iPhone。手元では動かさず、Vercel のプレビュー URL で確かめる
- Supabase・Vercel・Git に慣れていないので、画面のどこを押すかまで具体的に書く
- PR の作成・マージは頼まれたときだけ
