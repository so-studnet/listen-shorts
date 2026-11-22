# ListenShorts 設計

最終更新：2026-11-22（M4）。実装が変わったら更新する。

## 1. 技術構成

| 用途 | 使うもの | 理由 |
|---|---|---|
| 言語・画面 | TypeScript、Next.js 16（App Router）、React 19 | 画面とサーバー処理を1つのプロジェクトで書ける。前のアプリと同じ構成 |
| 見た目 | Tailwind CSS 4 | |
| 検証 | zod 4 | パックの検証と、保存データの読み込み |
| 単体テスト | Vitest | `src/lib/domain/` の純粋関数 |
| 画面のテスト | Playwright（`npm run e2e`） | スマホ幅（390×844、Chromium）で実際に操作して確かめる。YouTube の API は偽物に差し替える |
| 動画 | YouTube IFrame Player API（スクリプトを読み込んで使う。npm のパッケージは使わない） | 公式の埋め込みのみ |
| グラフ | ライブラリを使わず SVG で描く（M5） | 軽くするため |
| 保存 | localStorage（M1〜）→ Supabase（M8〜） | |
| 公開 | Vercel（M1 からプレビューで使う） | GitHub に push するだけで公開される |

Next.js 16 は学習データと API が違う点がある。コードを書く前に `node_modules/next/dist/docs/` の該当の手引きを読む（`AGENTS.md`）。

## 2. ディレクトリ構成

```
src/
  app/                    画面（App Router）
    page.tsx              フィード（クイズ・結果もこの中）
    review/page.tsx       復習
    stats/page.tsx        記録
    settings/page.tsx     設定・パック管理
  components/             画面の部品
    home.tsx              フィード（縦スワイプ・絞り込み・1本ごとの保存とご褒美の計算）
    clip-session.tsx      1本のクリップ（視聴・クイズ・結果）
    review-view.tsx       復習（今日の件数、1問ずつ、まとめ）
    answer-inputs.tsx     穴埋め・聞き分け・並べ替えの解答欄
    tab-bar.tsx           下部のタブバー（layout.tsx に置く）
  lib/
    domain/               純粋関数（画面にも保存先にも依存しない）とテスト
      constants.ts        ゲームの数値（得点・コンボ・時間・ライフ・レベル曲線・復習の間隔）
      answer.ts           解答の正規化と判定
      pack.ts             パックのスキーマ（zod）と検証、行番号の付与
      scoring.ts          得点・コンボ・スピードボーナス・ライフの換算
      shuffle.ts          種つきの乱数とシャッフル（選択肢・カード）
      level.ts            レベル曲線と称号
      badges.ts           バッジの定義（データ）と判定
      review.ts           復習キュー（段と期日）、日付の区切り（午前4時）、復習の得点
      stats.ts            記録の集計（週・タグ・アクセント）
      quiz.ts             1本のクリップの進行（状態と遷移）
      text.ts             文の語への分割、answer の位置、ヒント
      records.ts          保存データ（AppData）の形と読み込み
      catalog.ts          出題するクリップの並び
    store/                保存先（インターフェースと localStorage 実装、後で Supabase 実装）
    youtube/              IFrame Player API の読み込みと区間再生
  data/
    sample-pack.json      開発用のサンプルパック（架空の英文）
e2e/                      Playwright のテスト（fake-youtube.js：テスト用の偽の IFrame API）
docs/                     要件・設計・ロードマップ・パックの形式
scripts/check.sh          コミット前のチェック一式
```

## 3. データモデル

### パック（`docs/pack-format.md`）

読み込んだパックは、検証後の形（zod で型をつけたもの）のまま保存する。

### 保存データ（`AppData`）

```ts
type AppData = {
  packs: StoredPack[];          // 読み込んだパック（読み込んだ日時つき）
  answers: AnswerLog[];         // 解答1回ごとの記録（requirements F8）
  clipResults: ClipResult[];    // クリップ1本ごとの結果（lifeBonus を含む）
  progress: {
    combo: number;              // いまの連続正解数（M2）
    // xp・badges は M3 で足す。XP は answers.points と clipResults.lifeBonus の合計から計算する
  };
  review: ReviewEntry[];        // 復習キュー
  feedFilter: FeedFilter;       // フィードの絞り込み
};

type ReviewEntry = {
  itemId: string;
  packId: string;
  clipId: string;
  stage: number;                // 0..4（1日・3日・7日・14日・30日）。packId + itemId で1件
  dueAt: string;                // 次に出す日時（午前4時の区切りに合わせる、UTC の ISO 文字列）
  lastAnsweredAt: string;
};
```

- XP・レベル・バッジは、`answers` と `clipResults` から計算し直せるようにしておく。保存している `xp` と `badges` は表示を速くするための写し（M8 の同期で食い違ったら計算し直す）
- 進行中のクイズ（何問目か、ライフの残り）は保存しない。途中で閉じたら、そのクリップは最初からやり直し【Claude 決定】。解答済みの問題の記録は残る

### localStorage のキー

- `listen-shorts:v1:data` に `AppData` を JSON で保存する
- 形を変えたら `v2` にし、読み込み時に `v1` から移す。壊れた要素は要素単位で捨てる（zod の `safeParse` を要素ごとに使う）
- 【未確認】localStorage の上限は約 5MB。パック1つは数十 KB、解答記録は1件 300 バイトほどなので、1万件で約 3MB。M8 で Supabase に移るまでは足りる見込み

## 4. 設計のポイント

### 純粋関数で固める

判定・得点・コンボ・レベル・バッジ・復習・パックの検証・集計は、すべて `src/lib/domain/` の純粋関数にする。現在時刻は引数で受け取る（関数の中で `Date.now()` を呼ばない）。これでテストで日付の区切りやスピードボーナスを確かめられる。

### クイズの進行は状態遷移で表す

`quiz.ts` に、1本のクリップの状態（`watching`→`question`→`feedback`→…→`result`）と、操作（`startQuiz`・`replaySentence`・`replayWhole`・`playbackEnded`・`useHint`・`submit`・`next`）を受けて次の状態を返す関数を置く。画面は `useReducer` でこれを使う。ライフの消費・コンボ・得点の計算はここで行う。現在時刻と乱数の種は操作に含めて渡す。聞き直しの再生中の時間は `pausedMs` に積み、スピードボーナスの経過時間から除く（プレーヤーが止まったら `playbackEnded`）。

### 保存先はインターフェースの裏に隠す

```ts
interface AppStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppData;
  getServerSnapshot(): AppData;
  update(fn: (data: AppData) => AppData): void;
}
```

画面は `useSyncExternalStore` で読む。M1 は `LocalStorageStore`、M8 で `SupabaseStore` を追加し、ログイン状態で切り替える（前のアプリの `SwitchableAppStore` と同じ型）。ID はアプリで生成する（`crypto.randomUUID` が使えないときの代替つき）。

### YouTube の区間再生

- `src/lib/youtube/` で IFrame API のスクリプトを1回だけ読み込み、`YT.Player` を作る
- `playerVars`：`playsinline: 1`、`cc_load_policy: 0`、`rel: 0`、`controls: 0`（区間の外に行かないように）、`disablekb: 1`
- 区間の再生（`src/lib/youtube/use-segment-player.ts`）：`seekTo(start, true)` → `playVideo()` → 100ms ごとに `getCurrentTime()` を見て `end + PLAYBACK_TAIL_PADDING` を過ぎたら `pauseVideo()`。再生が始まった時点で位置が区間の外なら、もう一度 `seekTo` する（iPhone で最初の seekTo が効かない場合への備え。【未確認】実際に起きるか）
- iPhone では最初の再生をユーザーのタップの中で呼ぶ必要がある。【未確認】2回目以降（聞き直し）はタップから呼ぶので問題ない見込み
- 【未確認】ホーム画面に追加した PWA（standalone）の中でも埋め込みプレーヤーが再生できるか。M7 で確かめる
- プレーヤーの `onError`（埋め込み禁止 101/150、削除 100 など）を受けて「再生できません」を出す

### パックの検証と行番号

- まず `JSON.parse` 。失敗したら、エラーの位置（文字の番号）から行番号を出す
- 次に、JSON の各値が何行目にあるかの対応表を作る（小さな自前の走査で、パス → 行番号）
- zod のスキーマで型と範囲を確かめ、続けて文の中の `answer` の位置などの関係を確かめる。エラーのパスを対応表で行番号に直して出す

### フィード

- 縦の scroll-snap。スライド1枚 = 画面の高さ。スクロール位置から表示中の番号を出し、その1枚だけに `ClipSession`（YouTube のプレーヤー）を作る
- クイズ中は外側のスクロールを `overflow: hidden` にして止める（`ClipSession` の `onLockChange`）
- 1回のクリップには `sessionId` を振り、解答記録とクリップの結果に入れる（バッジの判定で「1本の中で」を数えるため）

### 日付と時刻

- 日付の区切り（午前4時）は端末のタイムゾーンで計算する（`logicalDayStart`）。保存は UTC の ISO 文字列
- 単体テストは `vitest.config.mts` で `TZ=Asia/Tokyo` に固定する。画面のテストは Playwright の `timezoneId: Asia/Tokyo` と `page.clock.setFixedTime` で日をまたがせる
- Next.js 16 では、事前描画（ビルド時）に `new Date()` を呼ぶとビルドが失敗する。時刻を使う部品は、ブラウザで描画したあと（`useHydrated` が true）にだけ描く

### 集計はアプリ側で

個人のデータ量なので、解答記録を全部読んでブラウザで集計する。週は月曜始まり、端末のタイムゾーンで区切る。

## 5. M8 以降（Supabase）の予定

詳細は M8 で決める。いまの予定は次のとおり。

- テーブル：`packs`（`user_id`、`pack_id`、`version`、`data jsonb`）、`answers`、`clip_results`、`review_entries`、`progress`
- すべてのテーブルに `user_id` を持たせ、RLS で `user_id = auth.uid()` の行だけ読み書きできるようにする
- ログインはメールアドレス（方式は M8 で決める）。自分のアカウントを作ったら、Supabase で新規登録を止める
- ブラウザ内のデータを、ログイン後に1回だけ取り込む
- 公開してよい値（Supabase の URL、Publishable key）だけを Vercel の環境変数に入れる。Secret key はアプリでは使わない
