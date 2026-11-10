-- 在 Supabase 项目 → SQL Editor 里整段执行（一次性）
-- 真正持久化：每条投票直接 INSERT 进 Postgres，无缓存窗口、无定时搬运

create table if not exists public.votes (
  id          bigint generated always as identity primary key,
  vid         text not null unique,
  wechat_id   text not null,
  orientation text not null check (orientation in ('h', 'v')),
  picks       text[] not null check (array_length(picks, 1) between 1 and 3),
  created_at  timestamptz not null default now(),
  constraint votes_wechat_group_key unique (wechat_id, orientation)
);

comment on table public.votes is '2027 影像日历投票；wechat_id 为 b64_ 编码';

alter table public.votes enable row level security;

grant select, insert on public.votes to anon, authenticated;
grant usage, select on sequence public.votes_id_seq to anon, authenticated;

drop policy if exists votes_read_all on public.votes;
create policy votes_read_all on public.votes
  for select to anon, authenticated using (true);

drop policy if exists votes_insert_all on public.votes;
create policy votes_insert_all on public.votes
  for insert to anon, authenticated with check (true);

-- 不允许客户端改票/删票：无 update / delete 策略，默认拒绝
-- 校验：select count(*) from public.votes;
