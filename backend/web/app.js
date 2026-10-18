/* DeskVerse Studio · no bundler, no framework. Works with Stage 12 FastAPI. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const state = { assets: [], sources: [], tasks: [], filter: 'all', query: '', sort: 'newest', openedAsset: null };
  let previewBlobUrl = null;
  let refetching = false;
  let lastImageObjectUrl = null;
  const activeStates = ['queued', 'submitting', 'generating', 'downloading'];
  const paramsToCM = (x) => Number.isFinite(Number(x)) ? `${Math.round(Number(x) * 1000) / 10} cm` : '—';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function toast(message, error = false) {
    const root = $('#toastRoot');
    const node = el('div', 'toast' + (error ? ' error' : ''), message);
    root.append(node);
    setTimeout(() => node.remove(), 5200);
  }
  async function request(path, options = {}) {
    const res = await fetch(path, { cache: 'no-store', ...options });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) {
      const detail = data.detail;
      const msg = typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : `HTTP ${res.status}`);
      throw new Error(msg);
    }
    return data;
  }
  function setConnection(online) {
    $('#connectionDot').className = 'status-dot ' + (online ? 'online' : 'offline');
    $('#connectionText').textContent = online ? '局域网服务已连接' : '无法连接本地服务';
  }
  async function refresh() {
    if (refetching) return;
    refetching = true;
    try {
      const [manifest, sources, jobs] = await Promise.all([
        request('/api/manifest'), request('/api/sources'),
        request('/api/tasks').catch(() => ({ tasks: [] }))
      ]);
      state.assets = Array.isArray(manifest.assets) ? manifest.assets : [];
      state.sources = Array.isArray(sources.sources) ? sources.sources : [];
      state.tasks = Array.isArray(jobs.tasks) ? jobs.tasks : [];
      setConnection(true);
      $('#assetCount').textContent = state.assets.length;
      $('#sourceCount').textContent = state.sources.length;
      $('#taskCount').textContent = state.tasks.filter(x => activeStates.includes(x.status)).length;
      $('#navCount').textContent = state.assets.length;
      renderLibrary();
      renderJobs();
    } catch (e) {
      setConnection(false);
      toast(`无法读取资产：${e.message}`, true);
    } finally { refetching = false; }
  }
  function when(asset) {
    if (asset.createdAt) {
      const dt = new Date(asset.createdAt);
      if (!Number.isNaN(dt.getTime())) return dt.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
    return '已导入';
  }
  function sortedItems() {
    let items = [
      ...state.assets.map((asset, i) => ({ type: 'model', item: asset, order: i })),
      ...state.sources.map((source, i) => ({ type: 'source', item: source, order: i }))
    ];
    if (state.filter === 'models') items = items.filter(x => x.type === 'model');
    if (state.filter === 'drafts') items = items.filter(x => x.type === 'source');
    if (state.query) items = items.filter(x => String(x.item.name || '').toLowerCase().includes(state.query));
    const dateKey = x => x.item.createdAt ? new Date(x.item.createdAt).getTime() : x.order * 1000;
    if (state.sort === 'name') items.sort((a,b) => (a.item.name || '').localeCompare(b.item.name || '', 'zh-CN'));
    else items.sort((a,b) => (state.sort === 'newest' ? -1 : 1) * (dateKey(a) - dateKey(b)));
    return items;
  }
  function coverIndex(id) {
    let hash = 0;
    for (const char of String(id).slice(0, 9)) hash += char.charCodeAt(0);
    return 1 + hash % 3;
  }
  function renderLibrary() {
    const grid = $('#assetGrid');
    grid.replaceChildren();
    const all = sortedItems();
    $('#libraryEmpty').classList.toggle('hidden', all.length > 0);
    for (const { type, item } of all) {
      const card = el('article', 'asset-card');
      const cover = el('div', 'card-cover cover-' + coverIndex(item.id));
      const imageURL = type === 'source' ? item.imageUrl : item.imageUrl;
      if (imageURL && /^\/api\/source-image\/[a-f0-9]{32}$/.test(imageURL)) {
        const img = el('img'); img.loading = 'lazy'; img.alt = item.name || '商品图片'; img.src = imageURL;
        img.onerror = () => { img.remove(); cover.prepend(el('div', 'cover-shape')); };
        cover.append(img);
      } else cover.append(el('div', 'cover-shape'));
      cover.append(el('span', 'card-type', type === 'model' ? '✳ 3D 模型' : '◧ 商品图片'));
      const coverOpen = el('button', 'cover-open', type === 'model' ? '↗' : '＋');
      coverOpen.type = 'button'; coverOpen.title = type === 'model' ? '预览 3D' : '开始生成';
      coverOpen.addEventListener('click', () => type === 'model' ? openPreview(item) : generate(item));
      cover.append(coverOpen);
      const info = el('div','card-info');
      info.append(el('h3','card-title', item.name || '未命名资产'));
      const meta = el('div', 'card-meta');
      meta.append(el('span','', `宽 ${paramsToCM(item.widthMeters)} · 深 ${paramsToCM(item.depthMeters)}`), el('span','',when(item)));
      info.append(meta);
      const bottom = el('div','card-bottom');
      const status = el('span', 'availability' + (type === 'source' ? ' pending' : ''), type === 'model' ? '可同步 PICO' : '待生成 3D');
      const actions = el('div','card-actions');
      const action = el('button','card-link', type === 'model' ? '一键预览 ↗' : '生成 3D ↗');
      action.type = 'button';
      action.addEventListener('click', () => type === 'model' ? openPreview(item) : generate(item));
      const remove = el('button', 'card-action-danger', '删除');
      remove.type = 'button'; remove.title = `删除 ${item.name}`;
      remove.addEventListener('click', () => removeItem(type, item));
      actions.append(action, remove); bottom.append(status,actions); info.append(bottom); card.append(cover,info); grid.append(card);
    }
  }
  function renderJobs() {
    const list = $('#jobsList');
    list.replaceChildren();
    if (!state.tasks.length) { list.append(el('div','jobs-empty','暂时没有生成任务。选择一张商品图片，点击「生成 3D」即可开始。')); return; }
    const statusText = { queued:'等待中', submitting:'提交中', generating:'生成中', downloading:'下载中', ready:'已完成', failed:'失败' };
    const lookup = new Map(state.sources.map(s => [s.id, s.name]));
    for (const task of state.tasks.slice(0,12)) {
      const card = el('div','job-card');
      const main = el('div','job-main');
      main.append(el('div','job-title',lookup.get(task.source_id) || '商品生成任务'),el('div','job-sub',task.message || '等待任务状态更新'));
      const pill = el('div','job-status' + (task.status === 'failed' ? ' failed' : activeStates.includes(task.status) ? ' running' : ''), statusText[task.status] || task.status);
      card.append(main,pill);list.append(card);
    }
  }
  async function removeItem(type, item) {
    const name = item.name || '未命名物品';
    const prompt = type === 'model'
      ? `确定删除「${name}」吗？服务器上的 GLB 会被删除。PICO 已经加载的模型需重启 DeskVerse 才会消失。`
      : `确定删除「${name}」的待生成图片吗？已生成的 GLB 不受影响。`;
    if (!confirm(prompt)) return;
    try {
      await request(type === 'model' ? `/api/assets/${encodeURIComponent(item.id)}` : `/api/sources/${encodeURIComponent(item.id)}`, {method:'DELETE'});
      toast('已从资产库移除「' + name + '」');
      if (state.openedAsset && state.openedAsset.id === item.id) closePreview();
      await refresh();
    } catch (e) { toast('删除失败：' + e.message, true); }
  }
  function openPreview(item) {
    state.openedAsset = item;
    $('#previewTitle').textContent = item.name || '未命名 3D 资产';
    $('#previewDimensions').textContent = `占地宽 ${paramsToCM(item.widthMeters)} · 深 ${paramsToCM(item.depthMeters)} · 外观宽 ${paramsToCM(item.visibleWidthMeters)}`;
    const viewer = $('#modelViewer');
    const notice = $('#viewerNotice'); notice.textContent = '正在加载 3D 预览…'; notice.classList.remove('hidden');
    viewer.removeAttribute('src');
    viewer.setAttribute('src', item.url);
    viewer.setAttribute('alt', item.name || '3D 预览');
    $('#downloadLink').href = item.url;
    $('#downloadLink').setAttribute('download', (item.name || 'deskverse-model').replace(/[\\/:*?"<>|]/g,'_') + '.glb');
    $('#previewModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // CDN unavailable: communicate clearly, and allow direct GLB download.
    setTimeout(() => {
      if ($('#previewModal').classList.contains('hidden')) return;
      if (!customElements.get('model-viewer')) {
        notice.textContent = '3D 预览组件未加载。请检查是否可访问 CDN；仍可下载 GLB 或在 PICO 查看。';
      }
    }, 7000);
  }
  function closePreview() {
    $('#previewModal').classList.add('hidden');
    $('#modelViewer').removeAttribute('src');
    state.openedAsset = null;
    document.body.style.overflow = '';
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    previewBlobUrl = null;
  }
  async function generate(source) {
    if (!confirm(`为「${source.name}」提交 Rodin 图生 3D 任务？此操作可能消耗 API 额度。`)) return;
    try {
      const response = await request('/api/generate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({source_id:source.id})});
      toast(`已提交「${source.name}」的生成任务`);
      document.querySelector('#jobs').scrollIntoView({behavior:'smooth',block:'start'});
      await refresh();
      if (response.task_id) monitorTask(response.task_id, source.name);
    } catch (e) { toast('无法提交生成：' + e.message, true); }
  }
  async function monitorTask(taskId, name) {
    for (let i = 0; i < 240; i++) {
      await new Promise(res => setTimeout(res, 5000));
      try {
        const result = await request(`/api/tasks/${encodeURIComponent(taskId)}`);
        await refresh();
        if (result.status === 'ready') { toast(`「${name}」的 3D 模型已生成，可在资产库预览及 PICO 摆放`);return; }
        if (result.status === 'failed') { toast(`「${name}」生成失败：${result.message || '未知原因'}`, true);return; }
      } catch (e) { toast('任务状态查询中断：' + e.message, true);return; }
    }
  }
  function setSubmitBusy(form, busy) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = busy;
    if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
    button.textContent = busy ? '正在处理，请稍候…' : button.dataset.defaultText;
  }
  async function onUpload(e, type) {
    e.preventDefault();
    const form = e.currentTarget;
    setSubmitBusy(form,true);
    try {
      let result;
      if (type === 'url') {
        const data = Object.fromEntries(new FormData(form));
        for (const key of ['width_cm','depth_cm','visible_width_cm']) data[key] = Number(data[key]);
        result = await request('/api/sources/from-url',{method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      } else {
        result = await request(type === 'image' ? '/api/sources' : '/api/assets',{method:'POST',body:new FormData(form)});
      }
      if (result.ok) {
        toast(type === 'glb' ? 'GLB 已进入资产库，PICO 下次轮询后即可加载' : '图片已保存，前往资产库可点击「生成 3D」');
        form.reset();
        $('#imagePreview').classList.add('hidden');
        $('#imageFileName').textContent = '';
        $('#glbFileName').textContent = '';
        if (lastImageObjectUrl) URL.revokeObjectURL(lastImageObjectUrl);
        lastImageObjectUrl = null;
        state.filter = type === 'glb' ? 'models' : 'drafts';
        selectFilter(state.filter);
        await refresh();
        $('#library').scrollIntoView({behavior:'smooth'});
      }
    } catch (e) { toast((type === 'url' ? '链接解析失败：' : '导入失败：') + e.message, true); }
    finally { setSubmitBusy(form,false); }
  }
  function bindDropzone(zone, input) {
    for (const name of ['dragenter','dragover']) zone.addEventListener(name, e => {e.preventDefault();zone.classList.add('dragover')});
    for (const name of ['dragleave','drop']) zone.addEventListener(name, e => {e.preventDefault();zone.classList.remove('dragover')});
    zone.addEventListener('drop', e => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      if (typeof DataTransfer === 'undefined') return;
      const transfer = new DataTransfer();transfer.items.add(files[0]);input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
    });
  }
  function selectFilter(value) {
    state.filter = value;
    $$('.seg-btn').forEach(btn => {const selected=btn.dataset.filter===value;btn.classList.toggle('active',selected);btn.setAttribute('aria-selected',String(selected))});
    renderLibrary();
  }
  function setup() {
    $$('.seg-btn').forEach(btn => btn.addEventListener('click',()=>selectFilter(btn.dataset.filter)));
    $$('.create-tab').forEach(btn => btn.addEventListener('click',()=>{
      $$('.create-tab').forEach(other=>{other.classList.toggle('active',other===btn);other.setAttribute('aria-selected',String(other===btn))});
      $$('.upload-form').forEach(form=>form.classList.toggle('hidden',form.dataset.form!==btn.dataset.mode));
    }));
    $('#assetSearch').addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();renderLibrary()});
    $('#sortAssets').addEventListener('change',e=>{state.sort=e.target.value;renderLibrary()});
    $('#refreshBtn').addEventListener('click',refresh);
    $('#imageForm').addEventListener('submit',e=>onUpload(e,'image'));
    $('#urlForm').addEventListener('submit',e=>onUpload(e,'url'));
    $('#glbForm').addEventListener('submit',e=>onUpload(e,'glb'));
    bindDropzone($('#imageDropzone'),$('#imageFile'));
    bindDropzone($('#glbDropzone'),$('#glbFile'));
    $('#imageFile').addEventListener('change',e=>{
      const file=e.target.files[0];$('#imageFileName').textContent=file ? '已选择：'+file.name : '';
      if(lastImageObjectUrl) URL.revokeObjectURL(lastImageObjectUrl);
      const preview=$('#imagePreview');
      if(file){lastImageObjectUrl=URL.createObjectURL(file);preview.src=lastImageObjectUrl;preview.classList.remove('hidden')}
      else{preview.classList.add('hidden');lastImageObjectUrl=null}
    });
    $('#glbFile').addEventListener('change',e=>{$('#glbFileName').textContent=e.target.files[0] ? '已选择：'+e.target.files[0].name : ''});
    $('#closeModal').addEventListener('click',closePreview);
    $('#previewModal').addEventListener('click',e=>{if(e.target===$('#previewModal'))closePreview()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape' && !$('#previewModal').classList.contains('hidden'))closePreview()});
    $('#removeAsset').addEventListener('click',()=>{if(state.openedAsset)removeItem('model',state.openedAsset)});
    $('#modelViewer').addEventListener('load',()=>$('#viewerNotice').classList.add('hidden'));
    $('#modelViewer').addEventListener('error',()=>{$('#viewerNotice').classList.remove('hidden');$('#viewerNotice').textContent='此 GLB 暂时无法在浏览器预览，可下载文件或在 PICO 中查看。'});
    $('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
    $$('.nav-item').forEach(a=>a.addEventListener('click',()=>{$$('.nav-item').forEach(n=>n.classList.toggle('active',n===a));$('#sidebar').classList.remove('open')}));
    setInterval(refresh,12000);
    refresh();
  }
  document.addEventListener('DOMContentLoaded',setup);
})();
