-- ============================================================
-- お問い合わせ返信履歴（contact_replies）テーブル + RLS
--   実行場所 : Supabase ダッシュボード → SQL Editor
--   前提     : contacts_setup.sql を先に実行済みであること
--   方針     : 挿入は Edge Function（service role）経由のみ。
--              閲覧はログイン管理者（authenticated）のみ。
--              anon には一切の権限を与えない。
--   ※このスクリプトは何度実行しても安全（冪等）です
-- ============================================================

-- 1) テーブル作成 ------------------------------------------------
create table if not exists public.contact_replies (
  id          bigint generated always as identity primary key,
  contact_id  bigint not null references public.contacts(id) on delete cascade,
  body        text not null,
  sent_by     text,
  created_at  timestamptz not null default now(),
  constraint contact_replies_body_len check (char_length(body) between 1 and 5000)
);

create index if not exists contact_replies_contact_idx
  on public.contact_replies (contact_id, created_at);

-- 2) RLS 有効化 -------------------------------------------------
alter table public.contact_replies enable row level security;

-- 3) 既定権限を剥奪 --------------------------------------------
revoke all on public.contact_replies from anon;
revoke all on public.contact_replies from authenticated;

-- 4) 権限付与 --------------------------------------------------
--    authenticated は閲覧のみ。挿入は service role（Edge Function）が
--    RLS をバイパスして行うため、insert 権限は誰にも付与しない。
grant select on public.contact_replies to authenticated;
grant insert on public.contact_replies to service_role;  -- Edge Function（返信送信）が返信を記録するのに使用

-- 5) ポリシー：ログイン管理者の閲覧のみ ----------------------
drop policy if exists contact_replies_auth_select on public.contact_replies;
create policy contact_replies_auth_select
  on public.contact_replies
  for select
  to authenticated
  using (true);

-- ============================================================
-- 補足：
-- ・返信メールの実送信・記録は Edge Function `send-contact-reply` が
--   service role で行います（このテーブルへ直接 INSERT できるのは
--   service role のみ）。
-- ・authenticated = ログイン済みユーザー。公開サインアップは必ず
--   OFF にしてください（contacts_setup.sql の注記参照）。
-- ============================================================
