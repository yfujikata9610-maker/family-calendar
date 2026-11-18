-- ふたりカレンダー：データベース定義
-- Supabase の「SQL Editor」に全文を貼り付けて Run してください（1回だけ）。

-- ① プロフィール（表示名と色）
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  color text not null unique check (color in ('blue', 'pink')),
  created_at timestamptz not null default now()
);

-- ② 予定
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  all_day boolean not null default true,
  start_time time,
  end_time time,
  who text not null check (who in ('blue', 'pink', 'shared')),
  note text not null default '',
  remind_minutes int,
  remind_at timestamptz,
  reminded boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_date_idx on public.events (date);
create index events_remind_idx on public.events (remind_at) where reminded = false;

-- ③ メモ（自由メモ／チェックリスト）
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('text', 'checklist')),
  title text not null default '',
  body text not null default '',
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ④ チェックリストの項目
create table public.note_items (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  text text not null default '',
  done boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index note_items_note_idx on public.note_items (note_id);

-- ⑤ 通知の送り先（端末ごと）
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- 権限：アプリ（ログイン済み）と通知関数（service_role）から表を使えるようにする
-- （プロジェクト作成時に「新しい表を自動公開」をオフにしていても動くよう明示）
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on
  public.profiles, public.events, public.notes, public.note_items, public.push_subscriptions
  to authenticated, service_role;

-- アクセス制限：ログインした人だけが読み書きできる
-- （新規登録はダッシュボードで無効化し、2人のアカウントだけを作る前提）
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.notes enable row level security;
alter table public.note_items enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "profiles_read" on public.profiles for select to authenticated using (true);
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "events_all" on public.events for all to authenticated using (true) with check (true);
create policy "notes_all" on public.notes for all to authenticated using (true) with check (true);
create policy "note_items_all" on public.note_items for all to authenticated using (true) with check (true);

create policy "push_own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- リアルタイム同期の対象にする
alter publication supabase_realtime add table public.events, public.notes, public.note_items, public.profiles;
