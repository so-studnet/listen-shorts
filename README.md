# ListenShorts

短い英語動画（YouTube の埋め込み）を見て、聞き取りクイズを解く、個人用の英語リスニング練習アプリ。

- 15〜60秒の動画 → 穴埋め・聞き分け・並べ替えのクイズ → 結果 → 次の動画へ（縦スワイプ）
- XP・レベル・バッジ・コンボ・スピードボーナス、間違えた問題の間隔反復（1→3→7→14→30日）
- 誤りの種類（L/R・機能語・語末子音・連結）ごとの正答率の推移
- Next.js 16 + TypeScript + Tailwind、Supabase（ログイン・同期・RLS）、Vercel、PWA

正解の文はクリップパック（JSON）で読み込む。他人の動画の文字起こしを含むので、本物のパックはこのリポジトリに入れない。

- 要件：[docs/requirements.md](docs/requirements.md)
- 設計：[docs/architecture.md](docs/architecture.md)
- ロードマップ：[docs/roadmap.md](docs/roadmap.md)
- クリップパックの形式：[docs/pack-format.md](docs/pack-format.md)
- 準備と確かめ方：[docs/setup.md](docs/setup.md)

開発のルールは [CLAUDE.md](CLAUDE.md)。
