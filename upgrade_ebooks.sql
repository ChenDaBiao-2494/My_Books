-- ============================================================
-- 我的藏书 · 电子书文件功能升级脚本（给已存在的项目用）
-- 使用方法：Supabase 控制台 -> SQL Editor -> New query ->
-- 粘贴全部内容 -> Run。可重复执行，不会报错。
-- ============================================================

-- 1. 给书籍表加电子书文件字段（已存在则跳过）
alter table public.books add column if not exists file_url  text;
alter table public.books add column if not exists file_name text;
alter table public.books add column if not exists file_size bigint;

-- 2. 新建电子书存储桶
insert into storage.buckets (id, name, public)
values ('ebooks', 'ebooks', true)
on conflict (id) do nothing;

-- 3. 电子书桶的公开读写策略（先删再建，保证可重复执行）
drop policy if exists "ebooks_public_read"   on storage.objects;
drop policy if exists "ebooks_public_insert" on storage.objects;
drop policy if exists "ebooks_public_update" on storage.objects;
drop policy if exists "ebooks_public_delete" on storage.objects;

create policy "ebooks_public_read"   on storage.objects for select using (bucket_id = 'ebooks');
create policy "ebooks_public_insert" on storage.objects for insert with check (bucket_id = 'ebooks');
create policy "ebooks_public_update" on storage.objects for update using (bucket_id = 'ebooks');
create policy "ebooks_public_delete" on storage.objects for delete using (bucket_id = 'ebooks');

-- 完成！
