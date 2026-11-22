# クリップパックの形式（schemaVersion 1）

最終更新：2026-11-20（M0）

クリップパックを作る別のチャット（Claude）に、このファイルをそのまま渡して使う。アプリは読み込み時にここの「検証ルール」で検査し、違反があれば行番号つきでエラーを出す。

## 例

> この例の `videoId`（`XXXXXXXXXXX`）は仮のもので、YouTube に存在しない。そのまま読み込むと「この動画は再生できません」と出る。本物のパックでは実在する動画の ID を入れる。

```json
{
  "schemaVersion": 1,
  "packId": "2026-11-week4",
  "title": "11月第4週",
  "version": 1,
  "clips": [
    {
      "clipId": "c001",
      "videoId": "XXXXXXXXXXX",
      "start": 128.0,
      "end": 158.0,
      "title": "動画のタイトル",
      "channel": "チャンネル名",
      "accent": "UK",
      "difficulty": 2,
      "sentences": [
        {
          "sid": "s1",
          "start": 128.0,
          "end": 134.5,
          "text": "Okay, we got to start today with an absolutely bizarre story.",
          "ja": "さて、今日はまったく奇妙な話から始めないといけない。"
        }
      ],
      "items": [
        {
          "itemId": "2026-11-week4-c001-q1",
          "type": "cloze",
          "sid": "s1",
          "answer": "an absolutely bizarre",
          "tags": ["function_word", "vocab"],
          "note": "an が弱く消えやすい。bizarre は後ろに強勢"
        },
        {
          "itemId": "2026-11-week4-c001-q2",
          "type": "choice",
          "sid": "s1",
          "answer": "bizarre",
          "options": ["bizarre", "buzzer"],
          "tags": ["vocab"],
          "note": "強勢の位置で区別する"
        },
        {
          "itemId": "2026-11-week4-c001-q3",
          "type": "order",
          "sid": "s1",
          "answer": "we got to start today",
          "tags": ["linking"],
          "note": "got to が連結して「ガッタ」になる"
        }
      ]
    }
  ]
}
```

## 項目

### パック

| 項目 | 型 | 必須 | 内容 |
|---|---|---|---|
| `schemaVersion` | 整数 | ○ | この形式の版。今は `1` |
| `packId` | 文字列 | ○ | パックの ID。英数字・`-`・`_` のみ、1〜64文字 |
| `title` | 文字列 | ○ | 表示名 |
| `version` | 整数（1 以上） | ○ | パックの改訂番号。同じ `packId` を直したら増やす |
| `clips` | 配列 | ○ | 1本以上 |

### クリップ（`clips[]`）

| 項目 | 型 | 必須 | 内容 |
|---|---|---|---|
| `clipId` | 文字列 | ○ | パックの中で一意 |
| `videoId` | 文字列 | ○ | YouTube の動画 ID（11文字、英数字・`-`・`_`） |
| `start` / `end` | 数値（秒） | ○ | クリップの区間。`end − start` は 5〜90秒（目安 15〜60秒） |
| `title` | 文字列 | ○ | 動画のタイトル |
| `channel` | 文字列 | ○ | チャンネル名 |
| `accent` | `"US"` `"UK"` `"AU"` `"other"` | ○ | 話者のアクセント |
| `difficulty` | 整数 1〜5 | ○ | 1：ゆっくりはっきり、2：ふつうの解説、3：ふつうの会話、4：速い雑談、5：映画の速い会話 |
| `sentences` | 配列 | ○ | 1つ以上 |
| `items` | 配列 | ○ | 1〜8問（目安 3〜5問）。この順に出題する |

### 文（`sentences[]`）

| 項目 | 型 | 必須 | 内容 |
|---|---|---|---|
| `sid` | 文字列 | ○ | クリップの中で一意 |
| `start` / `end` | 数値（秒） | ○ | 文の区間。クリップの区間の中に収める。`start < end` |
| `text` | 文字列 | ○ | 正解の文（人の目で直したもの） |
| `ja` | 文字列 | | 和訳。結果画面に出す |

### 問題（`items[]`）

| 項目 | 型 | 必須 | 内容 |
|---|---|---|---|
| `itemId` | 文字列 | ○ | **すべてのパックを通して一意**。`<packId>-<clipId>-q<番号>` を勧める。パックを改訂しても同じ問題は同じ ID のままにする（復習の記録が引き継がれる） |
| `type` | `"cloze"` `"choice"` `"order"` | ○ | 形式 |
| `sid` | 文字列 | ○ | ひもづく文 |
| `answer` | 文字列 | ○ | 文の `text` の中に**そのまま含まれる連続した語**（大文字小文字・句読点の違いは許す）。cloze は1〜4語、choice は1〜3語、order は3〜8語 |
| `occurrence` | 整数（1 以上） | | `answer` が文の中に何度も出るとき、何回目かを指定する。省略すると 1 |
| `accept` | 文字列の配列 | | cloze の別解（`"10"` と `"ten"`、`"gonna"` と `"going to"` など） |
| `options` | 文字列の配列 | choice のみ ○ | 2〜4個。`answer` を含み、重複しないこと |
| `tags` | 配列 | ○ | 1つ以上：`function_word`（機能語・弱形）／`l_r`（L と R）／`final_consonant`（語末子音）／`linking`（連結）／`vocab`（知らない単語）／`other` |
| `note` | 文字列 | ○ | 解答後に出す短い解説（日本語、1〜2文） |

## 検証ルール（アプリが読み込み時に確かめること）

1. JSON として読めること（読めなければ、その行・列と説明を出す）
2. 上の表の型・必須・値の範囲を満たすこと
3. `clipId` はパック内で、`sid` はクリップ内で、`itemId` はパック内で一意。ほかのパックの `itemId` と重なるときは警告する（読み込みは止めない）
4. 文の区間はクリップの区間の中にあること
5. `sid` が同じクリップの文を指していること
6. `answer` が文の中に連続した語として見つかること。`occurrence` 回目が存在すること
7. choice の `options` が `answer` を含み、重複がないこと
8. order の `answer` を並べ替えた結果が、元の順と同じにしかならない（すべて同じ語など）ものはエラー

判定のための比べ方（大文字小文字・句読点・短縮形）は `docs/requirements.md` の F3 を参照。

## パックを作る人（Claude）への注意

- 穴埋めは全体の7割ほど、聞き分けと並べ替えで3割ほどにする
- 空欄には、利用者が苦手な4つ（L/R、機能語・弱形、語末子音、連結）が入る部分を優先して選ぶ
- 聞き分けの選択肢は、実際に聞き違えやすい組（light/right、code/coke、walk/work）にする
- 開始・終了の秒は、文の頭と終わりが切れないよう 0.2秒ほど余裕を持たせる
- 本物のパックは、アプリの「設定 → パック管理」で読み込む。**リポジトリにはコミットしない**
