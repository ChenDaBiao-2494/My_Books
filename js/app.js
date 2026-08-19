/* ============================================================
   我的藏书 · 应用逻辑
   ============================================================ */
(function () {
  'use strict';

  const CFG = window.APP_CONFIG || {};

  // ---------- 状态 ----------
  const state = {
    folders: [],        // 扁平分类数组
    books: [],          // 全部书籍（含回收站）
    view: 'all',        // 'all' | 'trash' | folderId
    folderId: null,
    search: '',
    tag: null,
    editingId: null,    // 正在编辑的书籍 id（null=新增）
    coverFile: null,    // 待上传的封面 File
    coverChanged: false,
    coverRemoved: false,
  };

  const supabase = window.supabase ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;
  const configured = CFG.SUPABASE_URL && !/YOUR-PROJECT/.test(CFG.SUPABASE_URL) && CFG.SUPABASE_ANON_KEY && !/YOUR-ANON/.test(CFG.SUPABASE_ANON_KEY);

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    brandTitle: $('brandTitle'), brandSub: $('brandSub'),
    search: $('searchInput'), searchClear: $('searchClear'),
    addBtn: $('addBtn'), trashBtn: $('trashBtn'), menuBtn: $('menuBtn'),
    sidebar: $('sidebar'), sidebarBackdrop: $('sidebarBackdrop'),
    folderTree: $('folderTree'), newFolderBtn: $('newFolderBtn'),
    currentFolderTitle: $('currentFolderTitle'), bookCount: $('bookCount'),
    tagFilter: $('tagFilter'), bookGrid: $('bookGrid'),
    emptyState: $('emptyState'), emptyTitle: $('emptyTitle'),
    loading: $('loading'), configBanner: $('configBanner'),
    // 编辑弹窗
    bookModal: $('bookModal'), coverDrop: $('coverDrop'), coverInput: $('coverInput'), cameraInput: $('cameraInput'),
    coverPreview: $('coverPreview'), coverPlaceholder: $('coverPlaceholder'),
    coverRemove: $('coverRemove'), cameraBtn: $('cameraBtn'), galleryBtn: $('galleryBtn'),
    fTitle: $('fTitle'), fAuthor: $('fAuthor'), fFolder: $('fFolder'),
    fTags: $('fTags'), fRating: $('fRating'), fNotes: $('fNotes'),
    deleteBookBtn: $('deleteBookBtn'), saveBookBtn: $('saveBookBtn'),
    // 通用弹窗
    promptModal: $('promptModal'), promptTitle: $('promptTitle'), promptInput: $('promptInput'), promptOk: $('promptOk'),
    confirmModal: $('confirmModal'), confirmTitle: $('confirmTitle'), confirmText: $('confirmText'), confirmOk: $('confirmOk'),
    toast: $('toast'),
  };

  // ---------- 工具 ----------
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { els.toast.hidden = true; }, 2200);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function folderName(id) {
    const f = state.folders.find((x) => x.id === id);
    return f ? f.name : '未分类';
  }

  function parseTags(str) {
    return String(str || '').split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
  }

  // ---------- 数据加载 ----------
  async function loadAll() {
    els.loading.hidden = false;
    try {
      const [fRes, bRes] = await Promise.all([
        supabase.from('folders').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('books').select('*').order('created_at', { ascending: false }),
      ]);
      if (fRes.error) throw fRes.error;
      if (bRes.error) throw bRes.error;
      state.folders = fRes.data || [];
      state.books = bRes.data || [];
    } catch (err) {
      console.error(err);
      toast('加载数据失败：' + err.message);
    } finally {
      els.loading.hidden = true;
    }
    render();
  }

  // ---------- 分类树 ----------
  function buildTree(folders) {
    const map = {};
    folders.forEach((f) => { map[f.id] = { ...f, children: [] }; });
    const roots = [];
    folders.forEach((f) => {
      if (f.parent_id && map[f.parent_id]) map[f.parent_id].children.push(map[f.id]);
      else roots.push(map[f.id]);
    });
    const sort = (list) => list.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
    sort(roots);
    roots.forEach((r) => sort(r.children));
    return roots;
  }

  function folderCount(id) {
    return state.books.filter((b) => !b.deleted_at && b.folder_id === id).length;
  }

  function renderFolderRow(node, depth) {
    const hasChild = node.children.length > 0;
    const count = folderCount(node.id);
    const active = state.view !== 'all' && state.view !== 'trash' && state.folderId === node.id;
    const wrap = document.createElement('div');

    const row = document.createElement('div');
    row.className = 'folder-row' + (active ? ' active' : '');
    row.style.paddingLeft = (6 + depth * 16) + 'px';

    const toggle = document.createElement('button');
    toggle.className = 'fold-toggle' + (hasChild ? '' : ' leaf');
    toggle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    toggle.addEventListener('click', (e) => { e.stopPropagation(); toggleFolder(wrap, toggle, hasChild); });
    row.appendChild(toggle);

    const icon = document.createElement('span');
    icon.className = 'fold-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 5h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4V5z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>';
    row.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'fold-name';
    name.textContent = node.name;
    row.appendChild(name);

    const cnt = document.createElement('span');
    cnt.className = 'fold-count';
    cnt.textContent = count || '';
    row.appendChild(cnt);

    const menu = document.createElement('button');
    menu.className = 'fold-menu';
    menu.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>';
    menu.addEventListener('click', (e) => { e.stopPropagation(); showFolderMenu(e, node.id, node.name); });
    row.appendChild(menu);

    row.addEventListener('click', () => selectFolder(node.id));
    wrap.appendChild(row);

    if (hasChild) {
      const children = document.createElement('div');
      children.className = 'folder-children';
      node.children.forEach((c) => children.appendChild(renderFolderRow(c, depth + 1)));
      wrap.appendChild(children);
    }
    return wrap;
  }

  function toggleFolder(wrap, toggle, hasChild) {
    if (!hasChild) return;
    const child = wrap.querySelector('.folder-children');
    if (child) {
      child.style.display = child.style.display === 'none' ? '' : 'none';
      toggle.classList.toggle('open');
    }
  }

  function renderSidebar() {
    const tree = buildTree(state.folders);
    els.folderTree.innerHTML = '';

    // 全部书籍
    const all = document.createElement('div');
    all.className = 'folder-row all-item' + (state.view === 'all' ? ' active' : '');
    all.innerHTML = '<button class="fold-toggle leaf"></button>' +
      '<span class="fold-icon"><svg viewBox="0 0 24 24"><path d="M4 5h6l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4V5z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg></span>' +
      '<span class="fold-name">全部书籍</span>' +
      '<span class="fold-count">' + state.books.filter((b) => !b.deleted_at).length + '</span>';
    all.addEventListener('click', () => selectFolder('all'));
    els.folderTree.appendChild(all);

    // 分类树
    tree.forEach((node) => els.folderTree.appendChild(renderFolderRow(node, 0)));

    // 回收站
    const trash = document.createElement('div');
    trash.className = 'folder-row trash-item' + (state.view === 'trash' ? ' active' : '');
    trash.innerHTML = '<button class="fold-toggle leaf"></button>' +
      '<span class="fold-icon"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span>' +
      '<span class="fold-name">回收站</span>' +
      '<span class="fold-count">' + state.books.filter((b) => b.deleted_at).length + '</span>';
    trash.addEventListener('click', () => selectFolder('trash'));
    els.folderTree.appendChild(trash);
  }

  function selectFolder(view) {
    state.view = view;
    state.folderId = view === 'all' || view === 'trash' ? null : view;
    state.tag = null;
    els.search.value = '';
    state.search = '';
    els.searchClear.hidden = true;
    closeSidebar();
    render();
  }

  // ---------- 过滤 ----------
  function visibleBooks() {
    let list = state.books.filter((b) => !b.deleted_at);
    if (state.view === 'trash') {
      list = state.books.filter((b) => b.deleted_at);
    } else if (state.folderId) {
      list = list.filter((b) => b.folder_id === state.folderId);
    }
    const q = state.search.trim().toLowerCase();
    if (q) {
      list = list.filter((b) => {
        const tagStr = (b.tags || []).join(' ');
        return (b.title || '').toLowerCase().includes(q) ||
          (b.author || '').toLowerCase().includes(q) ||
          (b.notes || '').toLowerCase().includes(q) ||
          tagStr.toLowerCase().includes(q);
      });
    }
    if (state.tag) {
      list = list.filter((b) => (b.tags || []).includes(state.tag));
    }
    return list;
  }

  // ---------- 渲染主区 ----------
  function render() {
    renderSidebar();
    renderTagFilter();
    renderGrid();

    if (state.view === 'all') els.currentFolderTitle.textContent = '全部书籍';
    else if (state.view === 'trash') els.currentFolderTitle.textContent = '回收站';
    else els.currentFolderTitle.textContent = folderName(state.folderId);

    els.trashBtn.classList.toggle('active', state.view === 'trash');
  }

  function renderTagFilter() {
    const counts = {};
    visibleBooks().forEach((b) => (b.tags || []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
    const tags = Object.keys(counts).slice(0, 12);
    els.tagFilter.innerHTML = '';
    tags.forEach((t) => {
      const chip = document.createElement('button');
      chip.className = 'tag-chip' + (state.tag === t ? ' active' : '');
      chip.textContent = '#' + t + ' ' + counts[t];
      chip.addEventListener('click', () => {
        state.tag = state.tag === t ? null : t;
        renderTagFilter();
        renderGrid();
      });
      els.tagFilter.appendChild(chip);
    });
  }

  function renderGrid() {
    const list = visibleBooks();
    els.bookCount.textContent = list.length ? list.length + ' 本' : '';
    els.bookGrid.innerHTML = '';

    if (!list.length) {
      els.emptyState.hidden = false;
      if (state.view === 'trash') {
        els.emptyTitle.textContent = '回收站是空的';
      } else if (state.search || state.tag) {
        els.emptyTitle.textContent = '没有匹配的结果';
      } else {
        els.emptyTitle.textContent = '这里还没有书籍';
      }
      return;
    }
    els.emptyState.hidden = true;

    list.forEach((b) => els.bookGrid.appendChild(renderCard(b)));
  }

  function renderCard(b) {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.style.animationDelay = '0s';

    const cover = document.createElement('div');
    cover.className = 'book-cover';
    if (b.cover_url) {
      const img = document.createElement('img');
      img.src = b.cover_url;
      img.alt = b.title;
      img.loading = 'lazy';
      img.onerror = () => {
        cover.classList.add('no-cover');
        cover.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 19V5a1 1 0 0 1 1-1h5a2 2 0 0 1 2 2 2 2 0 0 1 2-2h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
      };
      cover.appendChild(img);
    } else {
      cover.classList.add('no-cover');
      cover.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 19V5a1 1 0 0 1 1-1h5a2 2 0 0 1 2 2 2 2 0 0 1 2-2h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
    }

    // 悬浮操作
    const shade = document.createElement('div');
    shade.className = 'cover-shade';
    if (state.view === 'trash') {
      const restore = document.createElement('button');
      restore.textContent = '恢复';
      restore.addEventListener('click', (e) => { e.stopPropagation(); restoreBook(b.id); });
      const del = document.createElement('button');
      del.textContent = '彻底删除';
      del.className = 'danger';
      del.addEventListener('click', (e) => { e.stopPropagation(); permanentDelete(b); });
      shade.appendChild(restore);
      shade.appendChild(del);
    } else {
      const edit = document.createElement('button');
      edit.textContent = '编辑';
      edit.addEventListener('click', (e) => { e.stopPropagation(); openEdit(b.id); });
      const del = document.createElement('button');
      del.textContent = '删除';
      del.className = 'danger';
      del.addEventListener('click', (e) => { e.stopPropagation(); softDelete(b.id); });
      shade.appendChild(edit);
      shade.appendChild(del);
    }
    cover.appendChild(shade);

    card.appendChild(cover);

    const meta = document.createElement('div');
    meta.className = 'book-meta';

    const title = document.createElement('div');
    title.className = 'book-title';
    title.textContent = b.title;
    meta.appendChild(title);

    if (b.author) {
      const author = document.createElement('div');
      author.className = 'book-author';
      author.textContent = b.author;
      meta.appendChild(author);
    }

    if (b.rating) {
      const rating = document.createElement('div');
      rating.className = 'book-rating';
      rating.textContent = '★'.repeat(Math.min(5, b.rating)) + '☆'.repeat(Math.max(0, 5 - b.rating));
      meta.appendChild(rating);
    }

    if (b.tags && b.tags.length) {
      const tags = document.createElement('div');
      tags.className = 'book-tags';
      b.tags.slice(0, 3).forEach((t) => {
        const s = document.createElement('span');
        s.textContent = '#' + t;
        tags.appendChild(s);
      });
      meta.appendChild(tags);
    }

    card.appendChild(meta);
    card.addEventListener('click', () => openDetail(b.id));
    return card;
  }

  // ---------- 分类菜单 ----------
  function showFolderMenu(e, id, name) {
    const actions = [
      { label: '重命名', fn: () => promptText('重命名分类', name, (v) => renameFolder(id, v)) },
      { label: '新建子分类', fn: () => promptText('在「' + name + '」下新建分类', '', (v) => createFolder(v, id)) },
      { label: '删除分类', danger: true, fn: () => confirmAction('删除分类「' + name + '」？', '该分类下的书籍会移到「未分类」，子分类会一并删除。此操作不可恢复。', () => deleteFolder(id)) },
    ];
    showFolderDropdown(e, actions);
  }

  function showFolderDropdown(e, actions) {
    let menu = document.querySelector('.dropdown-menu');
    if (menu) menu.remove();
    menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.textContent = a.label;
      if (a.danger) b.classList.add('danger');
      b.addEventListener('click', () => { menu.remove(); a.fn(); });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);

    // 定位到点击按钮旁
    const rect = (e.target.closest('.fold-menu') || e.target).getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 12) + 'px';
    menu.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12)) + 'px';

    function close(ev) {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); document.removeEventListener('scroll', close, true); }
    }
    setTimeout(() => {
      document.addEventListener('click', close);
      document.addEventListener('scroll', close, true);
    }, 0);
  }

  // ---------- 分类 CRUD ----------
  async function createFolder(name, parentId) {
    if (!name.trim()) return;
    const { error } = await supabase.from('folders').insert({ name: name.trim(), parent_id: parentId || null, sort_order: state.folders.length });
    if (error) { toast('新建失败：' + error.message); return; }
    toast('分类已创建');
    await loadAll();
  }

  async function renameFolder(id, name) {
    if (!name.trim()) return;
    const { error } = await supabase.from('folders').update({ name: name.trim() }).eq('id', id);
    if (error) { toast('重命名失败：' + error.message); return; }
    toast('已重命名');
    await loadAll();
  }

  async function deleteFolder(id) {
    const { error } = await supabase.from('folders').delete().eq('id', id);
    if (error) { toast('删除失败：' + error.message); return; }
    toast('分类已删除');
    if (state.folderId === id) selectFolder('all');
    else await loadAll();
  }

  // ---------- 书籍操作 ----------
  function openAdd() {
    state.editingId = null;
    state.coverFile = null;
    state.coverChanged = false;
    state.coverRemoved = false;
    els.fTitle.value = '';
    els.fAuthor.value = '';
    els.fTags.value = '';
    els.fNotes.value = '';
    setRating(0);
    els.coverPreview.hidden = true;
    els.coverPreview.removeAttribute('src');
    els.coverPlaceholder.hidden = false;
    els.coverRemove.hidden = true;
    els.coverDrop.classList.remove('has-image');
    els.deleteBookBtn.hidden = true;
    populateFolderSelect(null);
    openModal(els.bookModal);
    setTimeout(() => els.fTitle.focus(), 60);
  }

  function openEdit(id) {
    const b = state.books.find((x) => x.id === id);
    if (!b) return;
    state.editingId = id;
    state.coverFile = null;
    state.coverChanged = false;
    state.coverRemoved = false;
    els.fTitle.value = b.title || '';
    els.fAuthor.value = b.author || '';
    els.fTags.value = (b.tags || []).join(', ');
    els.fNotes.value = b.notes || '';
    setRating(b.rating || 0);
    if (b.cover_url) {
      els.coverPreview.src = b.cover_url;
      els.coverPreview.hidden = false;
      els.coverPlaceholder.hidden = true;
      els.coverDrop.classList.add('has-image');
    } else {
      els.coverPreview.hidden = true;
      els.coverPreview.removeAttribute('src');
      els.coverPlaceholder.hidden = false;
      els.coverDrop.classList.remove('has-image');
    }
    els.coverRemove.hidden = true;
    els.deleteBookBtn.hidden = false;
    populateFolderSelect(b.folder_id);
    openModal(els.bookModal);
  }

  function openDetail(id) {
    // 详情即编辑弹窗（点击卡片直接打开编辑）
    openEdit(id);
  }

  function populateFolderSelect(selectedId) {
    els.fFolder.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '未分类';
    els.fFolder.appendChild(none);
    const add = (list, depth) => {
      list.forEach((f) => {
        const o = document.createElement('option');
        o.value = f.id;
        o.textContent = '　'.repeat(depth) + f.name;
        if (f.id === selectedId) o.selected = true;
        els.fFolder.appendChild(o);
        if (f.children) add(f.children, depth + 1);
      });
    };
    add(buildTree(state.folders), 0);
  }

  function setRating(v) {
    state._rating = v;
    els.fRating.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('on', +btn.dataset.v <= v);
    });
  }

  function compressImage(file, maxW = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxW) { height = Math.round(height * maxW / width); width = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('压缩失败')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
      img.src = url;
    });
  }

  async function saveBook() {
    const title = els.fTitle.value.trim();
    if (!title) { toast('请填写书名'); els.fTitle.focus(); return; }

    els.saveBookBtn.disabled = true;
    els.saveBookBtn.textContent = '保存中…';

    let coverUrl = state.editingId ? (state.books.find((b) => b.id === state.editingId)?.cover_url || null) : null;

    try {
      // 上传新封面
      if (state.coverFile) {
        const blob = await compressImage(state.coverFile);
        const path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
        const { error: upErr } = await supabase.storage.from('covers').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('covers').getPublicUrl(path);
        coverUrl = pub.publicUrl;
      } else if (state.coverRemoved) {
        coverUrl = null;
      }

      const payload = {
        title,
        author: els.fAuthor.value.trim() || null,
        folder_id: els.fFolder.value || null,
        tags: parseTags(els.fTags.value),
        notes: els.fNotes.value.trim() || null,
        rating: state._rating || null,
        cover_url: coverUrl,
      };

      if (state.editingId) {
        const { error } = await supabase.from('books').update(payload).eq('id', state.editingId);
        if (error) throw error;
        toast('已保存');
      } else {
        const { error } = await supabase.from('books').insert(payload);
        if (error) throw error;
        toast('已添加');
      }

      closeModal(els.bookModal);
      await loadAll();
    } catch (err) {
      console.error(err);
      toast('保存失败：' + err.message);
    } finally {
      els.saveBookBtn.disabled = false;
      els.saveBookBtn.textContent = '保存';
    }
  }

  async function softDelete(id) {
    const { error } = await supabase.from('books').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast('删除失败：' + error.message); return; }
    toast('已移到回收站');
    await loadAll();
  }

  async function restoreBook(id) {
    const { error } = await supabase.from('books').update({ deleted_at: null }).eq('id', id);
    if (error) { toast('恢复失败：' + error.message); return; }
    toast('已恢复');
    await loadAll();
  }

  function permanentDelete(b) {
    confirmAction('彻底删除「' + b.title + '」？', '删除后将无法恢复，封面图片也会一并删除。', async () => {
      const { error } = await supabase.from('books').delete().eq('id', b.id);
      if (error) { toast('删除失败：' + error.message); return; }
      if (b.cover_url) {
        const m = b.cover_url.match(/\/covers\/(.+)$/);
        if (m) { try { await supabase.storage.from('covers').remove([m[1]]); } catch (e) {} }
      }
      toast('已彻底删除');
      await loadAll();
    });
  }

  // ---------- 弹窗控制 ----------
  function openModal(m) { m.hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(m) { m.hidden = true; document.body.style.overflow = ''; }

  function promptText(title, value, onOk) {
    els.promptTitle.textContent = title;
    els.promptInput.value = value || '';
    els.promptOk.onclick = () => { closeModal(els.promptModal); onOk(els.promptInput.value); };
    openModal(els.promptModal);
    setTimeout(() => { els.promptInput.focus(); els.promptInput.select(); }, 60);
  }

  function confirmAction(title, text, onOk) {
    els.confirmTitle.textContent = title;
    els.confirmText.textContent = text;
    els.confirmOk.onclick = () => { closeModal(els.confirmModal); onOk(); };
    openModal(els.confirmModal);
  }

  function closeSidebar() {
    els.sidebar.classList.remove('open');
    els.sidebarBackdrop.classList.remove('show');
  }

  // ---------- 事件绑定 ----------
  function bind() {
    // 品牌名
    if (CFG.SITE_NAME) els.brandTitle.textContent = CFG.SITE_NAME;
    if (CFG.SITE_SUBTITLE) els.brandSub.textContent = CFG.SITE_SUBTITLE;
    document.title = CFG.SITE_NAME || '我的藏书';

    els.addBtn.addEventListener('click', openAdd);

    els.trashBtn.addEventListener('click', () => selectFolder('trash'));

    els.menuBtn.addEventListener('click', () => {
      els.sidebar.classList.add('open');
      els.sidebarBackdrop.classList.add('show');
    });
    els.sidebarBackdrop.addEventListener('click', closeSidebar);

    // 搜索（防抖）
    let t;
    els.search.addEventListener('input', () => {
      clearTimeout(t);
      const v = els.search.value;
      els.searchClear.hidden = !v;
      t = setTimeout(() => { state.search = v; renderGrid(); }, 200);
    });
    els.searchClear.addEventListener('click', () => {
      els.search.value = '';
      els.searchClear.hidden = true;
      state.search = '';
      renderGrid();
    });

    // 新建分类
    els.newFolderBtn.addEventListener('click', () => promptText('新建分类', '', (v) => createFolder(v, null)));

    // 封面（拍照 / 相册 双入口）
    els.coverDrop.addEventListener('click', () => els.galleryBtn.click());
    els.cameraBtn.addEventListener('click', (e) => { e.stopPropagation(); els.cameraInput.click(); });
    els.galleryBtn.addEventListener('click', (e) => { e.stopPropagation(); els.coverInput.click(); });
    const onFile = (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      state.coverFile = f;
      state.coverChanged = true;
      state.coverRemoved = false;
      const reader = new FileReader();
      reader.onload = () => {
        els.coverPreview.src = reader.result;
        els.coverPreview.hidden = false;
        els.coverPlaceholder.hidden = true;
        els.coverDrop.classList.add('has-image');
        els.coverRemove.hidden = false;
      };
      reader.readAsDataURL(f);
      e.target.value = '';
    };
    els.coverInput.addEventListener('change', onFile);
    els.cameraInput.addEventListener('change', onFile);
    els.coverRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      state.coverFile = null;
      state.coverChanged = false;
      state.coverRemoved = true;
      els.coverPreview.hidden = true;
      els.coverPreview.removeAttribute('src');
      els.coverPlaceholder.hidden = false;
      els.coverDrop.classList.remove('has-image');
      els.coverRemove.hidden = true;
    });

    // 评分
    els.fRating.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => setRating(+btn.dataset.v));
    });

    // 保存 / 删除
    els.saveBookBtn.addEventListener('click', saveBook);
    els.deleteBookBtn.addEventListener('click', () => {
      if (!state.editingId) return;
      const b = state.books.find((x) => x.id === state.editingId);
      confirmAction('删除「' + (b?.title || '') + '」？', '将移到回收站，可随时恢复。', async () => {
        closeModal(els.bookModal);
        await softDelete(state.editingId);
      });
    });

    // 关闭弹窗（点击遮罩 / 关闭按钮 / 取消）
    document.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => {
        closeModal(els.bookModal);
        closeModal(els.promptModal);
        closeModal(els.confirmModal);
      });
    });

    // 键盘
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal(els.bookModal);
        closeModal(els.promptModal);
        closeModal(els.confirmModal);
        closeSidebar();
      }
      if (e.key === 'Enter' && !els.promptModal.hidden) els.promptOk.click();
    });
  }

  // ---------- 演示数据（未配置 Supabase 时预览用） ----------
  function loadDemo() {
    const demo = [
      { id: 'd1', title: '活着', author: '余华', tags: ['文学', '小说', '已读'], rating: 5, notes: '人是为活着本身而活着', cover_url: 'https://picsum.photos/seed/book1/600/800' },
      { id: 'd2', title: '百年孤独', author: '加西亚·马尔克斯', tags: ['文学', '魔幻现实主义'], rating: 5, notes: '多年以后，面对行刑队……', cover_url: 'https://picsum.photos/seed/book2/600/800' },
      { id: 'd3', title: '三体', author: '刘慈欣', tags: ['科幻', '中国'], rating: 5, notes: '给岁月以文明', cover_url: 'https://picsum.photos/seed/book3/600/800' },
      { id: 'd4', title: '围城', author: '钱钟书', tags: ['文学', '小说'], rating: 4, cover_url: 'https://picsum.photos/seed/book4/600/800' },
      { id: 'd5', title: '平凡的世界', author: '路遥', tags: ['文学', '长篇'], rating: 5, cover_url: 'https://picsum.photos/seed/book5/600/800' },
      { id: 'd6', title: '小王子', author: '圣埃克苏佩里', tags: ['童话', '哲学'], rating: 5, notes: '本质的东西用眼睛是看不见的', cover_url: 'https://picsum.photos/seed/book6/600/800' },
      { id: 'd7', title: '人类简史', author: '尤瓦尔·赫拉利', tags: ['历史', '社科'], rating: 4, cover_url: 'https://picsum.photos/seed/book7/600/800' },
      { id: 'd8', title: '红楼梦', author: '曹雪芹', tags: ['古典', '文学'], rating: 5, cover_url: 'https://picsum.photos/seed/book8/600/800' },
    ];
    state.books = demo;
    state.folders = [];
    els.loading.hidden = true;
    els.configBanner.innerHTML = '这是<strong>演示数据</strong>：配置好 Supabase 后即可保存真实书籍（步骤见 README.md）';
    els.configBanner.hidden = false;
    render();
  }

  // ---------- 启动 ----------
  function init() {
    bind();
    if (!window.supabase) {
      els.configBanner.textContent = '加载 Supabase SDK 失败，请检查网络连接。';
      els.configBanner.hidden = false;
      els.loading.hidden = true;
      els.emptyState.hidden = false;
      els.emptyTitle.textContent = '无法连接网络';
      return;
    }
    if (!configured) {
      loadDemo();
      return;
    }
    els.configBanner.hidden = true;
    loadAll();
  }

  init();
})();
