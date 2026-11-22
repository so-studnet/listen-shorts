-- ListenShorts：初期スキーマ
-- 作業記録アプリなどと同じ Supabase プロジェクトに置くので、表と関数の名前は ls_ で始める。
--
-- すべての行は user_id で持ち主を表し、RLS で本人の行だけを読み書きできるようにする。
-- ID はアプリ側で作る文字列。パックの ID（packId）はユーザーごとに一意なので、主キーは (user_id, id)。
-- 集計はアプリ側で行うので、行はアプリのデータをそのまま写した形にする。

create table public.ls_packs (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  data         jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 5000000),
  imported_at  timestamptz not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.ls_answers (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           text not null check (char_length(id) between 1 and 64),
  session_id   text check (char_length(session_id) <= 64),
  answered_at  timestamptz not null,
  source       text not null check (source in ('feed', 'retry', 'review')),
  pack_id      text not null check (char_length(pack_id) <= 64),
  clip_id      text not null check (char_length(clip_id) <= 64),
  item_id      text not null check (char_length(item_id) <= 128),
  type         text not null check (type in ('cloze', 'choice', 'order')),
  tags         text[] not null default '{}',
  accent       text not null check (accent in ('US', 'UK', 'AU', 'other')),
  difficulty   smallint not null check (difficulty between 1 and 5),
  input        text not null check (char_length(input) <= 500),
  verdict      text not null check (verdict in ('correct', 'close', 'wrong')),
  replays      integer not null check (replays >= 0),
  elapsed_ms   integer not null check (elapsed_ms >= 0),
  hint_used    boolean not null,
  speed_bonus  integer not null default 0 check (speed_bonus >= 0),
  points       integer not null check (points >= 0),
  primary key (user_id, id)
);

create table public.ls_clip_results (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           text not null check (char_length(id) between 1 and 64),
  finished_at  timestamptz not null,
  pack_id      text not null check (char_length(pack_id) <= 64),
  clip_id      text not null check (char_length(clip_id) <= 64),
  source       text not null check (source in ('feed', 'retry')),
  total        integer not null check (total >= 0),
  correct      integer not null check (correct between 0 and total),
  points       integer not null check (points >= 0),
  life_bonus   integer not null default 0 check (life_bonus >= 0),
  lives_left   integer not null check (lives_left >= 0),
  max_combo    integer not null check (max_combo >= 0),
  primary key (user_id, id)
);

-- 復習キュー。id は "packId/itemId"
create table public.ls_review_entries (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null check (char_length(id) between 3 and 200),
  pack_id           text not null check (char_length(pack_id) <= 64),
  clip_id           text not null check (char_length(clip_id) <= 64),
  item_id           text not null check (char_length(item_id) <= 128),
  stage             smallint not null check (stage between 0 and 4),
  due_at            timestamptz not null,
  last_answered_at  timestamptz not null,
  primary key (user_id, id),
  constraint ls_review_entries_id_matches check (id = pack_id || '/' || item_id)
);

-- コンボ・バッジ・フィードの絞り込み（ユーザーごとに1行）
create table public.ls_progress (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  combo        integer not null default 0 check (combo >= 0),
  badges       jsonb not null default '[]' check (jsonb_typeof(badges) = 'array'),
  feed_filter  jsonb not null default '{}' check (jsonb_typeof(feed_filter) = 'object'),
  updated_at   timestamptz not null default now()
);

create index ls_review_entries_due_idx on public.ls_review_entries (user_id, due_at);

-- updated_at を自動更新する（作業記録アプリの set_updated_at と別にする）
create function public.ls_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger ls_packs_updated_at before update on public.ls_packs
  for each row execute function public.ls_set_updated_at();
create trigger ls_progress_updated_at before update on public.ls_progress
  for each row execute function public.ls_set_updated_at();

-- RLS：本人の行だけ
alter table public.ls_packs enable row level security;
alter table public.ls_answers enable row level security;
alter table public.ls_clip_results enable row level security;
alter table public.ls_review_entries enable row level security;
alter table public.ls_progress enable row level security;

create policy "own ls_packs" on public.ls_packs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own ls_answers" on public.ls_answers for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own ls_clip_results" on public.ls_clip_results for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own ls_review_entries" on public.ls_review_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own ls_progress" on public.ls_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 未ログイン（anon）には何も許さない
revoke all on public.ls_packs, public.ls_answers, public.ls_clip_results,
  public.ls_review_entries, public.ls_progress from anon;

-- 別の端末の変更を受け取る
alter publication supabase_realtime add table
  public.ls_packs, public.ls_answers, public.ls_clip_results,
  public.ls_review_entries, public.ls_progress;
