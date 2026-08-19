-- ============================================================
-- 我的藏书 · Supabase 初始化脚本
-- 使用方法：打开 Supabase 控制台 -> 左侧 "SQL Editor" ->
-- 新建一个查询 -> 把本文件全部内容粘贴进去 -> 点 Run 运行
-- ============================================================

-- ---------- 1. 数据表 ----------

-- 分类（文件夹）表：支持多级子分类
create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  parent_id   uuid references public.folders(id) on delete cascade,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 书籍表
create table if not exists public.books (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  author      text,
  folder_id   uuid references public.folders(id) on delete set null,
  cover_url   text,
  notes       text,
  tags        text[] not null default '{}',
  rating      integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz          -- 有值 = 在回收站；null = 正常
);

-- 索引：加快搜索和查询
create index if not exists idx_books_folder   on public.books(folder_id);
create index if not exists idx_books_deleted  on public.books(deleted_at);
create index if not exists idx_folders_parent on public.folders(parent_id);
create index if not exists idx_books_tags     on public.books using gin (tags);

-- 自动更新 updated_at 的触发器
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();


-- ---------- 2. 行级安全策略（RLS） ----------
-- 本网站为「完全公开」模式：任何人都能读写。
-- 若以后想改成只有自己能管理，再回来替换成带 auth 的策略即可。

alter table public.folders enable row level security;
alter table public.books   enable row level security;

create policy "folders_public_read"   on public.folders for select using (true);
create policy "folders_public_insert" on public.folders for insert with check (true);
create policy "folders_public_update" on public.folders for update using (true);
create policy "folders_public_delete" on public.folders for delete using (true);

create policy "books_public_read"   on public.books for select using (true);
create policy "books_public_insert" on public.books for insert with check (true);
create policy "books_public_update" on public.books for update using (true);
create policy "books_public_delete" on public.books for delete using (true);


-- ---------- 3. 封面图片存储桶 ----------
-- 建一个公开可读的存储桶 "covers" 用于存放书籍封面

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

create policy "covers_public_read"   on storage.objects for select using (bucket_id = 'covers');
create policy "covers_public_insert" on storage.objects for insert with check (bucket_id = 'covers');
create policy "covers_public_update" on storage.objects for update using (bucket_id = 'covers');
create policy "covers_public_delete" on storage.objects for delete using (bucket_id = 'covers');


-- ============================================================
-- 完成！现在回到项目目录，把 js/config.js 里的 Supabase
-- 地址和 anon key 填上，再按照 README.md 部署到 GitHub Pages。
-- ============================================================
