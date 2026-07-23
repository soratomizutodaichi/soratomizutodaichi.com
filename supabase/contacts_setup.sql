-- ============================================================
-- お問い合わせ（contacts）テーブル + RLS セットアップ
--   実行場所 : Supabase ダッシュボード → SQL Editor
--   プロジェクト : gcmtnzvcoovjqxanbmqc（soratomizutodaichi のサイト用）
--   方針     : anon は INSERT のみ・SELECT/UPDATE/DELETE 不可
--              閲覧・対応更新はログイン管理者（authenticated）のみ
--   ※このスクリプトは何度実行しても安全（冪等）です
-- ============================================================

-- 1) テーブル作成 ------------------------------------------------
create table if not exists public.contacts (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null,
  phone       text,
  category    text not null,
  message     text not null,
  status      text not null default 'new',
  -- token はフェーズ2（本人がWebでやり取り）用の予約。今は未使用。
  token       uuid not null default gen_random_uuid(),

  -- 入力値の妥当性を DB でも担保（アプリ側検証との二重化＝堅牢化）
  constraint contacts_name_len     check (char_length(name) between 1 and 100),
  constraint contacts_email_len    check (char_length(email) between 3 and 254),
  constraint contacts_email_format check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint contacts_phone_len    check (phone is null or char_length(phone) <= 30),
  constraint contacts_message_len  check (char_length(message) between 1 and 2000),
  constraint contacts_category_chk check (category in ('商品について','ご注文・配送について','取材・メディア','その他')),
  constraint contacts_status_chk   check (status in ('new','done'))
);

create index if not exists contacts_created_at_idx on public.contacts (created_at desc);

-- 2) RLS 有効化 -------------------------------------------------
alter table public.contacts enable row level security;

-- 3) 既定権限を剥奪 --------------------------------------------
--    このプロジェクトは新規テーブル作成時に anon/authenticated へ
--    権限が自動付与されるため、いったん全部剥がしてから絞り直す。
revoke all on public.contacts from anon;
revoke all on public.contacts from authenticated;

-- 4) 必要最小限のテーブル権限を付与 ---------------------------
grant insert on public.contacts to anon;                 -- 送信のみ
grant select, update on public.contacts to authenticated; -- 管理者の閲覧・対応更新
grant select, update on public.contacts to service_role;  -- Edge Function（返信送信）が宛先取得＆status更新に使用

-- 5) ポリシー --------------------------------------------------
-- (a) 匿名の INSERT：値を検証（true の全開放にはしない）
drop policy if exists contacts_anon_insert on public.contacts;
create policy contacts_anon_insert
  on public.contacts
  for insert
  to anon
  with check (
        char_length(name) between 1 and 100
    and char_length(email) between 3 and 254
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and (phone is null or char_length(phone) <= 30)
    and char_length(message) between 1 and 2000
    and category in ('商品について','ご注文・配送について','取材・メディア','その他')
    and status = 'new'
  );

-- (b) ログイン管理者の閲覧
drop policy if exists contacts_auth_select on public.contacts;
create policy contacts_auth_select
  on public.contacts
  for select
  to authenticated
  using (true);

-- (c) ログイン管理者の更新（対応状況の変更など）
drop policy if exists contacts_auth_update on public.contacts;
create policy contacts_auth_update
  on public.contacts
  for update
  to authenticated
  using (true)
  with check (status in ('new','done'));

-- ============================================================
-- 【重要・必須の安全設定】
-- authenticated = ログイン済みユーザー全員です。
-- 公開サインアップ（Authentication → Providers → Email の
-- 「Allow new users to sign up」）を必ず OFF にしてください。
-- OFF にしないと、誰でもアカウント登録すれば個人情報を含む
-- お問い合わせを閲覧できてしまいます。
--
-- （任意・さらに厳格にする場合）
-- 上記 (b)(c) の using(true) を、管理者メールだけに絞れます。
-- 例： using ( (auth.jwt() ->> 'email') in ('admin@example.com') )
-- 実際の管理者メールに置き換えて運用してください。
-- ============================================================
