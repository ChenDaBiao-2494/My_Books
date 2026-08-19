# 我的藏书 📚

一个**极简画廊风**的个人书籍管理网站，部署到 GitHub Pages，随时随地通过互联网访问。

- 大图封面（手机拍照即传，自动压缩）
- 像文件夹一样的多级分类
- 关键词搜索（书名 / 作者 / 备注 / 标签）
- 标签筛选 + 评分
- 回收站（可恢复、可彻底删除）
- 完全公开，无需登录

---

## 目录结构

```
book-library/
├── index.html          # 页面
├── css/styles.css      # 样式
├── js/config.js        # ⚠️ 唯一需要你改的文件（填 Supabase 信息）
├── js/app.js           # 逻辑
├── setup.sql           # Supabase 数据库初始化脚本
└── README.md
```

---

## 一、配置 Supabase（数据库 + 图片存储）

> Supabase 是免费的后端服务：免费版自带 500MB 数据库、1GB 图片存储，个人藏书绰绰有余。

1. 打开 https://supabase.com 注册/登录。
2. 点 **New project**，起个名字（如 `my-books`），设置数据库密码，地区选离你近的（如 Singapore）。
3. 项目创建好后，左侧菜单点 **SQL Editor** → **New query**。
4. 把本项目 `setup.sql` 里的**全部内容**粘贴进去，点 **Run**。这样数据表和存储桶就建好了。
5. 左侧菜单点 **Project Settings → API**，记下两个值：
   - **Project URL**（形如 `https://xxxx.supabase.co`）
   - **anon public** 那一串 key

## 二、填入密钥

打开 `js/config.js`，把上面两个值填进去：

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxx.supabase.co',   // ← 你的 Project URL
  SUPABASE_ANON_KEY: 'eyJhbGci...',            // ← 你的 anon key
  SITE_NAME: '我的藏书',                        // 网站标题，随意改
  SITE_SUBTITLE: '个人图书馆'
};
```

## 三、部署到 GitHub Pages

1. 打开 https://github.com 登录，点右上角 **+** → **New repository**。
2. 仓库名随意（如 `my-books`），选 **Public**，创建。
3. 把 `book-library` 文件夹里的所有文件上传到仓库根目录（或直接用 GitHub Desktop / `git push`）。
4. 进仓库 **Settings → Pages**：
   - Source 选 **Deploy from a branch**
   - Branch 选 **main**，文件夹选 **/ (root)**，保存。
5. 等 1~2 分钟，Pages 会给出一个网址：`https://你的用户名.github.io/my-books/`。

**搞定！** 手机、电脑、任何地方打开这个网址就能看到你的藏书，随时拍照添加。

---

## 常见问题

- **图片不显示？** 确认 `setup.sql` 里 storage 那段跑过了，且存储桶 `covers` 是 public。
- **保存失败？** 检查 `config.js` 的 URL 和 key 有没有填对、有没有多余空格。
- **想改成只有自己能管理？** 告诉我即可，我把「完全公开」换成登录模式（需要邮箱登录）。
- **免费额度够用吗？** 500MB 数据库 + 1GB 图片，按每本书封面压缩后 ~200KB 算，能存约 5000 本。

---

*安全提醒：当前为「完全公开」模式，任何知道网址的人都能增删改。如存放较私密的书籍信息，建议改为登录模式。*
