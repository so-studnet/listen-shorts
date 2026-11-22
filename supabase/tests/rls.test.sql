-- ListenShorts：RLS と制約のテスト。失敗すると例外で止まる。
\set ON_ERROR_STOP on

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');

-- ユーザーA としてデータを作る
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.ls_packs (user_id, id, data, imported_at)
  values ('00000000-0000-0000-0000-00000000000a', 'week4', '{"packId":"week4"}', now());
insert into public.ls_answers (user_id, id, session_id, answered_at, source, pack_id, clip_id, item_id, type, tags, accent, difficulty, input, verdict, replays, elapsed_ms, hint_used, speed_bonus, points)
  values ('00000000-0000-0000-0000-00000000000a', 'a1', 's1', now(), 'feed', 'week4', 'c1', 'q1', 'cloze', '{l_r}', 'UK', 2, 'Alizona', 'wrong', 1, 3000, false, 0, 0);
insert into public.ls_clip_results (user_id, id, finished_at, pack_id, clip_id, source, total, correct, points, life_bonus, lives_left, max_combo)
  values ('00000000-0000-0000-0000-00000000000a', 's1', now(), 'week4', 'c1', 'feed', 4, 3, 400, 60, 2, 3);
insert into public.ls_review_entries (user_id, id, pack_id, clip_id, item_id, stage, due_at, last_answered_at)
  values ('00000000-0000-0000-0000-00000000000a', 'week4/q1', 'week4', 'c1', 'q1', 0, now(), now());
-- user_id を省いても auth.uid() が入る
insert into public.ls_progress (combo, badges) values (2, '[{"id":"first_clear","earnedAt":"2026-11-22T00:00:00.000Z"}]');

do $$ begin
  assert (select count(*) from public.ls_answers) = 1, 'A は自分の解答を読める';
  assert (select user_id from public.ls_progress) = '00000000-0000-0000-0000-00000000000a', 'user_id は自動で入る';
end $$;

-- 同じ id は upsert で上書きできる（主キーは user_id + id）
insert into public.ls_packs (user_id, id, data, imported_at)
  values ('00000000-0000-0000-0000-00000000000a', 'week4', '{"packId":"week4","version":2}', now())
  on conflict (user_id, id) do update set data = excluded.data;
do $$ begin
  assert (select data->>'version' from public.ls_packs where id = 'week4') = '2', 'upsert で置き換わる';
end $$;

-- 他人の user_id では書き込めない
do $$ begin
  begin
    insert into public.ls_answers (user_id, id, answered_at, source, pack_id, clip_id, item_id, type, accent, difficulty, input, verdict, replays, elapsed_ms, hint_used, points)
      values ('00000000-0000-0000-0000-00000000000b', 'x', now(), 'feed', 'p', 'c', 'i', 'cloze', 'US', 1, 'x', 'correct', 0, 0, false, 100);
    raise exception 'FAIL: 他人の user_id で書き込めてしまった';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 制約：値の範囲・選択肢・復習の id の形
do $$ begin
  begin
    insert into public.ls_answers (user_id, id, answered_at, source, pack_id, clip_id, item_id, type, accent, difficulty, input, verdict, replays, elapsed_ms, hint_used, points)
      values ('00000000-0000-0000-0000-00000000000a', 'bad', now(), 'feed', 'p', 'c', 'i', 'cloze', 'US', 9, 'x', 'correct', 0, 0, false, 100);
    raise exception 'FAIL: 難易度 9 が入ってしまった';
  exception when check_violation then null;
  end;
  begin
    insert into public.ls_answers (user_id, id, answered_at, source, pack_id, clip_id, item_id, type, accent, difficulty, input, verdict, replays, elapsed_ms, hint_used, points)
      values ('00000000-0000-0000-0000-00000000000a', 'bad', now(), 'feed', 'p', 'c', 'i', 'cloze', 'US', 1, 'x', 'maybe', 0, 0, false, 100);
    raise exception 'FAIL: verdict maybe が入ってしまった';
  exception when check_violation then null;
  end;
  begin
    insert into public.ls_clip_results (user_id, id, finished_at, pack_id, clip_id, source, total, correct, points, lives_left, max_combo)
      values ('00000000-0000-0000-0000-00000000000a', 'bad', now(), 'p', 'c', 'feed', 3, 4, 0, 0, 0);
    raise exception 'FAIL: 正解数が問題数を超えても入ってしまった';
  exception when check_violation then null;
  end;
  begin
    insert into public.ls_review_entries (user_id, id, pack_id, clip_id, item_id, stage, due_at, last_answered_at)
      values ('00000000-0000-0000-0000-00000000000a', 'p/other', 'p', 'c', 'q', 0, now(), now());
    raise exception 'FAIL: id と pack_id/item_id が食い違っても入ってしまった';
  exception when check_violation then null;
  end;
  begin
    insert into public.ls_packs (user_id, id, data, imported_at)
      values ('00000000-0000-0000-0000-00000000000a', 'bad id!', '{}', now());
    raise exception 'FAIL: 使えない文字の packId が入ってしまった';
  exception when check_violation then null;
  end;
end $$;

-- updated_at が更新される
do $$ declare before timestamptz; begin
  select updated_at into before from public.ls_progress;
  perform pg_sleep(0.01);
  update public.ls_progress set combo = 3;
  assert (select updated_at from public.ls_progress) > before, 'updated_at が更新される';
end $$;

-- ユーザーB からは A のデータが見えず、更新・削除もできない。B は同じ packId を自分で持てる
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from public.ls_packs) = 0, 'B から A のパックは見えない';
  assert (select count(*) from public.ls_answers) = 0, 'B から A の解答は見えない';
  assert (select count(*) from public.ls_clip_results) = 0, 'B から A の結果は見えない';
  assert (select count(*) from public.ls_review_entries) = 0, 'B から A の復習は見えない';
  assert (select count(*) from public.ls_progress) = 0, 'B から A の進み具合は見えない';
end $$;
update public.ls_progress set combo = 99;
delete from public.ls_answers where id = 'a1';
insert into public.ls_packs (user_id, id, data, imported_at)
  values ('00000000-0000-0000-0000-00000000000b', 'week4', '{"packId":"week4"}', now());

-- 未ログイン（anon）は読めない（権限ごと外している）
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin
    perform count(*) from public.ls_answers;
    raise exception 'FAIL: 未ログインで ls_answers を読めてしまった';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A に戻ると、B の更新・削除は効いていない
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select combo from public.ls_progress) = 3, 'B の更新は効かない';
  assert (select count(*) from public.ls_answers) = 1, 'B の削除は効かない';
  assert (select count(*) from public.ls_packs) = 1, 'B の同じ packId は A には見えない';
end $$;

reset role;
select 'RLS tests passed' as result;
