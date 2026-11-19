let token = localStorage.getItem('cw_token') || null;
let currentUser = null, chats = [], contacts = [], blockedUsers = [], stories = [];
let catalog = { regular: [], nft: [], market: [] }, myGifts = [], ws = null;
let regAva = null, editAva = null, newChatAva = null, activeTab = 'chats', activeFolder = 'all', activeChatId = null;
let replyToId = null, selectedMsgIds = new Set(), typingTimer = null;
let mediaRecorder = null, recordedChunks = [], callTimer = null, callPeerId = null, storyTimer = null;
let searchSeq = 0;

const STICKERS = ['🔥','❤️','😂','😍','😎','🥳','🤯','🥶','😭','🙏','👍','👎','⚡','💎','🚀','🎁','👑','💀','🐸','😈','🫡','👀','🤝','💯'];
const REACTS = ['👍','❤️','🔥','😂','⚡','🎉'];
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const RATING_LEVELS = [0, 300, 1500, 4000, 10000, 25000, 60000, 150000, 350000, 750000];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtTime = ts => { if (!ts) return ''; const d = new Date(ts); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); };
const fmtLast = u => !u ? '' : u.online ? 'в сети' : u.lastSeen ? 'был(а) в ' + fmtTime(u.lastSeen) : 'был(а) недавно';
const fmtCurrencyLabel = s => String(s ?? '').replace(/\bTON\b/gi, 'C-Coins').replace(/Telegram\s*Star/gi, 'CW Star');

const verifiedSvg = `<svg viewBox="0 0 24 24"><path fill="#38bdf8" d="M12 2l2.4 2.1 3.1-.3.8 3 2.7 1.6-.9 3 1.4 2.8-2.3 2-.4 3.1-3.1.2L12 22l-2.7-1.5-3.1-.2-.4-3.1-2.3-2L4.9 12.4l-.9-3 2.7-1.6.8-3 3.1.3L12 2Z"/><path fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="m8.8 12.2 2.2 2.2 4.5-4.8"/></svg>`;
const badgeHtml = `<span class="v-badge">${verifiedSvg}</span>`;
const doubleCheckSvg = `<svg viewBox="0 0 24 24"><path d="m2 12.5 4.2 4.2L14 9M9 12.5l4.2 4.2L21 9"/></svg>`;
const pinSvg = `<svg viewBox="0 0 24 24"><path d="M16 3l5 5-2 2-1.5-.5-4 4 .5 3.5-2 2-3.5-3.5-5 5-1.5-1.5 5-5L3.5 11l2-2 3.5.5 4-4L12.5 4z"/></svg>`;
const starMiniSvg = `<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>`;

if ($('notice-verified')) $('notice-verified').innerHTML = verifiedSvg;
if ($('brand-badge')) $('brand-badge').innerHTML = verifiedSvg;

function showToast(m) {
  const t = $('toast'); if (!t) return;
  t.textContent = m; t.classList.remove('hidden');
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.add('hidden'), 2600);
}
function openModal(h) { $('m-sheet').innerHTML = h; $('m-bg').classList.remove('hidden'); }
function closeModal() { $('m-bg').classList.add('hidden'); }
function openSubscreen(title, bodyHtml, actionsHtml = '') {
  $('sub-title').textContent = title;
  $('sub-actions').innerHTML = actionsHtml;
  $('sub-body').innerHTML = bodyHtml;
  $('sub-screen').classList.remove('hidden');
}
function closeSubscreen() { $('sub-screen').classList.add('hidden'); }
function copyTxt(t) { navigator.clipboard?.writeText(t); showToast('Скопировано: ' + t); }

async function api(method, url, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if ((r.status === 401 || (r.status === 403 && d.error === 'Аккаунт заблокирован')) && token) logout(true);
    throw new Error(d.error || 'Ошибка сервера');
  }
  return d;
}

function uploadAvatarFile(inp, prevId, phId, cb) {
  const f = inp.files?.[0]; if (!f) return;
  if (f.size > MAX_UPLOAD_BYTES) { showToast('Файл больше 12 МБ'); inp.value = ''; return; }
  const r = new FileReader();
  r.onerror = () => showToast('Не удалось прочитать файл');
  r.onload = e => {
    const img = new Image();
    img.onerror = () => showToast('Некорректное изображение');
    img.onload = () => {
      const c = document.createElement('canvas'), max = 360;
      let w = img.width, h = img.height;
      if (w > h && w > max) { h *= max / w; w = max; } else if (h > max) { w *= max / h; h = max; }
      c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.8);
      if (prevId && $(prevId)) { $(prevId).src = url; $(prevId).classList.remove('hidden'); }
      if (phId && $(phId)) $(phId).classList.add('hidden');
      cb(url);
    };
    img.src = e.target.result;
  };
  r.readAsDataURL(f);
}

// ==================== ПОДАРКИ: ГЛЯНЦЕВЫЕ SVG И РЕАЛЬНЫЕ NFT С FRAGMENT ====================
function glossyRegularSvg(id, size = 60) {
  const uid = String(id || 'heart') + '-' + Math.random().toString(36).slice(2, 6);
  const defs = `
    <radialGradient id="h-${uid}" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#ff8fb3"/><stop offset="55%" stop-color="#f42a6c"/><stop offset="100%" stop-color="#9b0d3d"/></radialGradient>
    <linearGradient id="gld-${uid}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff3a8"/><stop offset=".5" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/></linearGradient>
    <linearGradient id="slv-${uid}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8fafc"/><stop offset=".5" stop-color="#94a3b8"/><stop offset="1" stop-color="#475569"/></linearGradient>
    <radialGradient id="ice-${uid}" cx="35%" cy="25%" r="75%"><stop stop-color="#e0f7ff"/><stop offset=".5" stop-color="#38bdf8"/><stop offset="1" stop-color="#1d4ed8"/></radialGradient>
    <linearGradient id="fur-${uid}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e59c5c"/><stop offset=".6" stop-color="#b96728"/><stop offset="1" stop-color="#7c3f12"/></linearGradient>
  `;
  const art = {
    heart: `<path d="M90 132s-56-33-56-71c0-29 38-40 56-12 18-28 56-17 56 12 0 38-56 71-56 71Z" fill="url(#h-${uid})"/><ellipse cx="62" cy="54" rx="14" ry="8" transform="rotate(-25 62 54)" fill="#fff" opacity=".35"/><path d="M52 72h76v14H52z" fill="url(#gld-${uid})"/><path d="M83 46h14v80H83z" fill="url(#gld-${uid})"/><path d="M90 68c-22-22-36-2-14 8Zm0 0c22-22 36-2 14 8Z" fill="url(#gld-${uid})" stroke="#fff7cc" stroke-width="2"/>`,
    teddy: `<circle cx="56" cy="48" r="16" fill="url(#fur-${uid})"/><circle cx="124" cy="48" r="16" fill="url(#fur-${uid})"/><circle cx="56" cy="48" r="8" fill="#fcd9b6"/><circle cx="124" cy="48" r="8" fill="#fcd9b6"/><ellipse cx="90" cy="112" rx="34" ry="26" fill="url(#fur-${uid})"/><ellipse cx="90" cy="114" rx="18" ry="15" fill="#fcd9b6" opacity=".8"/><circle cx="90" cy="68" r="32" fill="url(#fur-${uid})"/><ellipse cx="90" cy="76" rx="15" ry="11" fill="#fde3c8"/><ellipse cx="90" cy="72" rx="6" ry="4" fill="#2c1608"/><circle cx="75" cy="62" r="4" fill="#18120e"/><circle cx="105" cy="62" r="4" fill="#18120e"/>`,
    giftbox: `<rect x="44" y="64" width="92" height="68" rx="14" fill="url(#h-${uid})"/><rect x="38" y="52" width="104" height="20" rx="8" fill="#ff5789"/><rect x="82" y="52" width="16" height="80" fill="url(#gld-${uid})"/><rect x="44" y="88" width="92" height="14" fill="url(#gld-${uid})"/><path d="M90 52c-28-24-36 4-10 8Zm0 0c28-24 36 4 10 8Z" fill="url(#gld-${uid})" stroke="#fff7cc" stroke-width="2"/>`,
    rose: `<path d="M90 88v46" stroke="#16a34a" stroke-width="7" stroke-linecap="round"/><path d="M90 112c-24-12-28 4-10 10Zm0-10c24-12 28 4 10 10Z" fill="#22c55e"/><path d="M90 94c-28 0-36-34-16-54 10 12 16 4 16-14 0 18 6 26 16 14 20 20 12 54-16 54Z" fill="url(#h-${uid})"/>`,
    cake: `<rect x="44" y="88" width="92" height="40" rx="12" fill="url(#fur-${uid})"/><rect x="44" y="86" width="92" height="14" rx="7" fill="#fff1f5"/><rect x="58" y="60" width="64" height="28" rx="9" fill="url(#h-${uid})"/><path d="M58 66q8 10 16 0t16 0 16 0 16 0" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="86" y="34" width="8" height="26" rx="4" fill="url(#gld-${uid})"/><path d="M90 16c8 10 7 18 0 21-7-3-8-11 0-21Z" fill="#fde047"/>`,
    bouquet: `<path d="M56 76h68l-34 62Z" fill="url(#slv-${uid})"/><circle cx="70" cy="58" r="18" fill="url(#h-${uid})"/><circle cx="110" cy="58" r="18" fill="#c084fc"/><circle cx="90" cy="44" r="20" fill="#fb7185"/><circle cx="90" cy="44" r="8" fill="#fde047"/>`,
    rocket: `<path d="M74 106 50 122l18-32Zm32 0 24 16-18-32Z" fill="url(#h-${uid})"/><path d="M90 18c24 22 30 56 22 92H68c-8-36-2-70 22-92Z" fill="url(#slv-${uid})"/><path d="M90 18c10 10 16 22 18 32H72c2-10 8-22 18-32Z" fill="url(#h-${uid})"/><circle cx="90" cy="68" r="14" fill="url(#ice-${uid})" stroke="#fff" stroke-width="3"/><path d="M80 110l10 30 10-30Z" fill="url(#gld-${uid})"/>`,
    champagne: `<rect x="70" y="54" width="40" height="82" rx="14" fill="#15803d"/><rect x="82" y="24" width="16" height="32" rx="5" fill="#166534"/><rect x="80" y="20" width="20" height="9" rx="4" fill="url(#gld-${uid})"/><rect x="74" y="78" width="32" height="26" rx="5" fill="url(#gld-${uid})"/><circle cx="122" cy="34" r="5" fill="#fde047"/>`,
    trophy: `<path d="M54 34h72v36c0 24-16 40-36 40S54 94 54 70Z" fill="url(#gld-${uid})"/><path d="M54 44H36c0 22 9 32 18 32m72-32h18c0 22-9 32-18 32" stroke="url(#gld-${uid})" stroke-width="7" fill="none"/><rect x="82" y="108" width="16" height="20" fill="url(#gld-${uid})"/><rect x="64" y="124" width="52" height="12" rx="5" fill="#b45309"/>`,
    ring: `<ellipse cx="90" cy="96" rx="34" ry="30" fill="none" stroke="url(#slv-${uid})" stroke-width="13"/><path d="M72 52 90 28l18 24-18 16Z" fill="url(#ice-${uid})" stroke="#fff" stroke-width="2"/>`,
    gem: `<path d="M56 38h68l28 32-62 66-62-66Z" fill="url(#ice-${uid})" stroke="#e0f7ff" stroke-width="2.5"/><path d="M28 70h124M56 38l16 32 18 66m34-98-16 32-18 66" stroke="#fff" stroke-opacity=".6" stroke-width="2" fill="none"/>`
  };
  return `<svg style="width:${size}px;height:${size}px;display:block;flex:none;filter:drop-shadow(0 6px 12px rgba(0,0,0,.45))" viewBox="0 0 180 160"><defs>${defs}</defs>${art[id] || art.heart}</svg>`;
}

function handleGiftImgError(img) {
  const fb = img.getAttribute('data-fallback-src');
  if (fb) {
    img.setAttribute('data-fallback-src', '');
    img.src = fb;
    return;
  }
  img.classList.add('hidden');
  if (img.nextElementSibling) img.nextElementSibling.classList.remove('hidden');
}

function giftImgHtml(g, sz = 56) {
  const isNft = !!(g?.isNft && g?.slug) || (!!g?.slug && !g?.regularId && !g?.id);
  if (!isNft) return glossyRegularSvg(g?.regularId || g?.id || 'heart', sz);
  const slug = String(g.slug).replace(/[^a-z0-9-]/gi, '');
  const primaryNum = Number(g.num) || Number(g.sampleId) || 1;
  const sampleNum = Number(g.sampleId) || 1;
  const primaryUrl = `https://nft.fragment.com/gift/${slug}-${primaryNum}.medium.jpg`;
  const fallbackUrl = sampleNum !== primaryNum ? `https://nft.fragment.com/gift/${slug}-${sampleNum}.medium.jpg` : `https://nft.fragment.com/gift/${slug}-1.medium.jpg`;
  const svgFb = `<svg style="width:${sz}px;height:${sz}px" viewBox="0 0 180 160"><path d="M90 22 138 50v60l-48 28-48-28V50Z" fill="#38bdf8" opacity=".85"/></svg>`;
  return `<div style="width:${sz}px;height:${sz}px;display:grid;place-items:center"><img src="${esc(primaryUrl)}" alt="${esc(g?.name || 'NFT')}" loading="lazy" style="width:${sz}px;height:${sz}px;object-fit:contain;border-radius:10px" data-fallback-src="${esc(fallbackUrl)}" onerror="handleGiftImgError(this)"><div class="hidden">${svgFb}</div></div>`;
}

// ==================== РЕЙТИНГ ПРОФИЛЯ ПО STAR HISTORY ====================
function calcRatingFromHistory() {
  let pts = 0;
  (currentUser?.starHistory || []).forEach(h => {
    const num = Math.abs(parseInt(String(h.amount || '').replace(/[^\d-]/g, ''), 10) || 0);
    const title = String(h.title || '');
    if (title.startsWith('Покупка с маркета')) pts += Math.round(num * 0.2);
    else if (title.startsWith('Покупка')) pts += num;
  });
  return pts;
}
function getRatingLevel(pts) {
  let lvl = 0;
  for (let i = 1; i < RATING_LEVELS.length; i++) if (pts >= RATING_LEVELS[i]) lvl = i;
  return lvl;
}
function openRatingSheet() {
  const pts = calcRatingFromHistory(), lvl = getRatingLevel(pts);
  const nextNeed = lvl + 1 < RATING_LEVELS.length ? RATING_LEVELS[lvl + 1] : RATING_LEVELS[RATING_LEVELS.length - 1];
  const prevNeed = RATING_LEVELS[lvl] || 0;
  const pct = nextNeed > prevNeed ? Math.min(100, Math.round(((pts - prevNeed) / (nextNeed - prevNeed)) * 100)) : 100;
  openModal(`
    <div style="text-align:center;margin-bottom:16px">
      <div class="rating-pill" style="font-size:18px;height:36px;min-width:44px;border-radius:12px;margin-bottom:10px">${lvl}</div>
      <h3>Рейтинг профиля: Уровень ${lvl}</h3>
      <p class="muted" style="font-size:13px;margin-top:6px">Очки из истории покупок: <b class="tabular">${pts.toLocaleString('ru-RU')}</b></p>
      <div style="height:6px;background:var(--card2);border-radius:99px;overflow:hidden;margin:12px auto 0;max-width:260px">
        <div style="height:100%;width:${pct}%;background:var(--cyan)"></div>
      </div>
    </div>
    <div class="card-blk" style="margin:0">
      <div class="info-item"><div class="info-v">+100% потраченных Stars</div><div class="info-l">Прямая покупка подарков из каталога</div></div>
      <div class="info-item"><div class="info-v">+20% потраченных Stars</div><div class="info-l">Покупка лотов на Маркете</div></div>
      <div class="info-item"><div class="info-v">Серверная база</div><div class="info-l">Считается по вашему реальному starHistory на сервере</div></div>
    </div>
  `);
}

// ==================== АВТОРИЗАЦИЯ И WEBSOCKET ====================
function setAuthMode(m) {
  $('tab-login').classList.toggle('active', m === 'login');
  $('tab-reg').classList.toggle('active', m === 'reg');
  $('form-login').classList.toggle('hidden', m !== 'login');
  $('form-reg').classList.toggle('hidden', m !== 'reg');
}

async function handleLogin() {
  try {
    const res = await api('POST', '/api/auth/login', {
      phone: $('l-phone').value, password: $('l-pass').value, cloudPassword: $('l-cloud').value
    });
    token = res.token; localStorage.setItem('cw_token', token); currentUser = res.user;
    $('l-pass').value = ''; $('l-cloud').value = '';
    await bootApp();
  } catch (e) { showToast(e.message); }
}

async function handleRegister() {
  try {
    const res = await api('POST', '/api/auth/register', {
      phone: $('r-phone').value, firstName: $('r-first').value, lastName: $('r-last').value,
      username: $('r-user').value, bio: $('r-bio').value, avatar: regAva,
      password: $('r-pass').value, cloudPassword: $('r-cloud').value
    });
    token = res.token; localStorage.setItem('cw_token', token); currentUser = res.user;
    regAva = null; $('r-pass').value = ''; $('r-cloud').value = '';
    await bootApp();
  } catch (e) { showToast(e.message); }
}

function logout(silent = false) {
  if (!silent && token) api('POST', '/api/auth/logout').catch(() => {});
  token = null; currentUser = null; chats = []; contacts = []; blockedUsers = []; stories = []; myGifts = [];
  regAva = null; editAva = null; newChatAva = null; activeTab = 'chats'; activeFolder = 'all'; activeChatId = null;
  replyToId = null; selectedMsgIds.clear(); localStorage.removeItem('cw_token');
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  $('ws-status')?.classList.remove('online');
  closeSubscreen(); closeChat(); closeModal(); closeGlobalSearch(); closePeerProfile(); closeStoryViewer();
  clearInterval(callTimer); callPeerId = null; $('call-overlay').classList.add('hidden');
  $('app-shell').classList.add('hidden'); $('auth-screen').classList.remove('hidden');
  $('l-pass').value = ''; $('l-cloud').value = ''; $('r-pass').value = ''; $('r-cloud').value = '';
}

function upsertChatMessage(chatId, msg) {
  if (!msg) return;
  const c = chats.find(x => x.id === chatId); if (!c) return;
  if (!c.messages.some(m => m.id === msg.id)) c.messages.push(msg);
  if (activeChatId === chatId) renderMessages();
  renderChats();
}

function connectWS() {
  if (!token) return;
  if (ws) { ws.onclose = null; ws.close(); }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}?token=${encodeURIComponent(token)}`);
  ws.onopen = () => $('ws-status')?.classList.add('online');
  ws.onclose = () => { $('ws-status')?.classList.remove('online'); if (token) setTimeout(connectWS, 3000); };
  ws.onmessage = ev => {
    try {
      const { event, payload } = JSON.parse(ev.data);
      if (event === 'message:new') {
        const c = chats.find(x => x.id === payload.chatId);
        if (!c) return refreshAllData();
        const isNew = !c.messages.some(m => m.id === payload.message.id);
        if (isNew) c.messages.push(payload.message);
        if (activeChatId === payload.chatId) { renderMessages(); api('POST', `/api/chats/${payload.chatId}/read`).catch(() => {}); }
        else if (isNew && payload.message.senderId !== currentUser.id) {
          c.unread = (c.unread || 0) + 1;
          if (currentUser.settings?.notifications !== false) showToast(`${c.title}: ${payload.message.text || 'Медиа'}`);
        }
        renderChats();
      } else if (event === 'message:edit') {
        const m = chats.find(x => x.id === payload.chatId)?.messages.find(m => m.id === payload.message.id);
        if (m) { m.text = payload.message.text; m.edited = true; if (activeChatId === payload.chatId) renderMessages(); renderChats(); }
      } else if (event === 'message:delete' && payload.forAll) {
        const c = chats.find(x => x.id === payload.chatId);
        if (c) { c.messages = c.messages.filter(m => m.id !== payload.msgId); if (activeChatId === payload.chatId) renderMessages(); renderChats(); }
      } else if (event === 'message:react') {
        const m = chats.find(x => x.id === payload.chatId)?.messages.find(m => m.id === payload.msgId);
        if (m) { m.reactions = payload.reactions; if (activeChatId === payload.chatId) renderMessages(); }
      } else if (event === 'message:read') {
        const c = chats.find(x => x.id === payload.chatId);
        if (c) { c.messages.forEach(m => { if (!m.readBy.includes(payload.userId)) m.readBy.push(payload.userId); }); if (activeChatId === payload.chatId) renderMessages(); }
      } else if (event === 'chat:pin') {
        const c = chats.find(x => x.id === payload.chatId);
        if (c) { c.pinnedMessageId = payload.pinnedMessageId; if (activeChatId === payload.chatId) renderPinnedBar(c); }
      } else if (event === 'chat:new') {
        if (!chats.some(c => c.id === payload.id)) chats.unshift(payload);
        renderChats();
      } else if (event === 'typing' && activeChatId === payload.chatId) {
        const c = chats.find(x => x.id === payload.chatId);
        if (c) $('r-sub').textContent = payload.isTyping ? 'печатает...' : (c.type === 'dm' ? fmtLast(c.peer) : `${c.members.length} участн.`);
      } else if (event === 'presence') {
        chats.forEach(c => { if (c.peer?.id === payload.userId) { c.peer.online = payload.online; c.peer.lastSeen = payload.lastSeen; } });
        contacts.forEach(u => { if (u.id === payload.userId) { u.online = payload.online; u.lastSeen = payload.lastSeen; } });
        if (activeChatId) {
          const ac = chats.find(x => x.id === activeChatId);
          if (ac?.type === 'dm' && ac.peer?.id === payload.userId) $('r-sub').textContent = fmtLast(ac.peer);
        }
        renderChats(); renderContacts();
      } else if (event === 'user:update') {
        currentUser = payload; applySettings(); refreshAllData().catch(err => showToast(err.message));
      } else if (event === 'call:signal') onWsCall(payload);
    } catch {}
  };
}

async function bootApp() {
  $('chats-skeleton').classList.remove('hidden');
  await refreshAllData();
  $('auth-screen').classList.add('hidden'); $('app-shell').classList.remove('hidden');
  $('chats-skeleton').classList.add('hidden');
  connectWS(); switchTab(activeTab || 'chats');
}

async function refreshAllData() {
  const [meR, chR, coR, stR, catR] = await Promise.all([
    api('GET','/api/auth/me'), api('GET','/api/chats'), api('GET','/api/contacts'), api('GET','/api/stories'), api('GET','/api/catalog')
  ]);
  currentUser = meR.user; chats = chR.chats; contacts = coR.contacts; blockedUsers = coR.blocked; stories = stR.stories; catalog = catR;
  const uR = await api('GET', `/api/users/${currentUser.id}`);
  myGifts = uR.user.gifts || [];
  applySettings(); renderAll();
}

function applySettings() {
  if (!currentUser) return;
  const s = currentUser.settings || {};
  document.body.classList.toggle('light', s.theme === 'light');
  document.documentElement.style.setProperty('--msg-fs', (s.fontSize || 15) + 'px');
  $('set-theme-sub').textContent = `${s.theme === 'light' ? 'Светлая' : 'Тёмная'} • ${s.fontSize || 15}px`;
  $('set-notif-sub').textContent = s.notifications !== false ? 'Включены' : 'Выключены';
  $('set-dl-sub').textContent = `Автозагрузка: ${s.autoDownload !== false ? 'Вкл' : 'Выкл'}`;
}

function renderAll() {
  if (!currentUser) return;
  const avaHtml = currentUser.avatar ? `<img src="${esc(currentUser.avatar)}" alt="">` : esc((currentUser.firstName?.[0] || 'C').toUpperCase());
  $('nav-ava').innerHTML = avaHtml;
  const tot = chats.filter(c => !c.archived).reduce((s, c) => s + (c.unread || 0), 0);
  $('nav-unread-badge').textContent = tot;
  $('nav-unread-badge').classList.toggle('hidden', tot === 0);
  renderStories(); renderChats(); renderContacts(); renderSettings(); renderProfile();
}

function switchTab(t) {
  activeTab = t;
  ['chats','contacts','settings','profile'].forEach(x => {
    $('view-' + x).classList.toggle('hidden', x !== t);
    $('nav-' + x).classList.toggle('active', x === t);
  });
}

// ==================== ИСТОРИИ ====================
function renderStories() {
  const ava = currentUser.avatar ? `<img src="${esc(currentUser.avatar)}" alt="">` : esc((currentUser.firstName?.[0] || 'C').toUpperCase());
  $('stories-strip').innerHTML =
    `<button type="button" class="st-node" onclick="openCreateStoryModal()"><div class="st-ring"><div class="st-core">${ava}</div></div><div class="st-txt">+ История</div></button>` +
    stories.map((s, i) => `<button type="button" class="st-node" onclick="openStoryViewer(${i})"><div class="st-ring ${(s.viewers||[]).includes(currentUser.id)?'seen':''}"><div class="st-core">${s.authorAvatar?`<img src="${esc(s.authorAvatar)}" alt="">`:esc((s.authorName||'U')[0])}</div></div><div class="st-txt">${esc(s.authorName)}</div></button>`).join('');
}

function openCreateStoryModal() {
  openModal(`
    <h3 style="margin-bottom:12px">Новая история</h3>
    <div class="fg"><input id="st-txt" class="tf" placeholder="Текст истории"><select id="st-priv" class="tf"><option value="everybody">Видят все</option><option value="contacts">Контакты</option></select></div>
    <input id="st-file" type="file" accept="image/*,video/*" class="hidden" onchange="publishMediaStory(this)">
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px"><input type="checkbox" id="st-save" checked> Сохранить в профиле</label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button" class="btn2" onclick="$('st-file').click()">Фото / Видео</button><button type="button" class="btn1" style="margin:0" onclick="publishTextStory()">Опубликовать</button></div>
  `);
}
async function publishTextStory() {
  const text = $('st-txt').value.trim(); if (!text) return showToast('Введите текст');
  try { await api('POST','/api/stories',{type:'text',text,privacy:$('st-priv').value,savedToProfile:$('st-save').checked}); closeModal(); await refreshAllData(); showToast('История опубликована'); } catch (e) { showToast(e.message); }
}
function publishMediaStory(inp) {
  const f = inp.files?.[0]; if (!f) return;
  if (f.size > MAX_UPLOAD_BYTES) { showToast('Файл больше 12 МБ'); inp.value=''; return; }
  const r = new FileReader();
  r.onload = async e => {
    try {
      const up = await api('POST','/api/upload',{dataUrl:e.target.result,fileName:f.name});
      await api('POST','/api/stories',{type:f.type.startsWith('video')?'video':'photo',text:$('st-txt').value.trim(),mediaUrl:up.url,privacy:$('st-priv').value,savedToProfile:$('st-save').checked});
      closeModal(); await refreshAllData(); showToast('История опубликована');
    } catch (err) { showToast(err.message); }
  };
  r.readAsDataURL(f); inp.value = '';
}
function openStoryViewer(i) {
  const s = stories[i]; if (!s) return;
  api('POST', `/api/stories/${s.id}/view`).catch(() => {});
  if (!s.viewers.includes(currentUser.id)) s.viewers.push(currentUser.id);
  renderStories();
  $('sv-ava').innerHTML = s.authorAvatar ? `<img src="${esc(s.authorAvatar)}" alt="">` : esc((s.authorName||'U')[0]);
  $('sv-author').textContent = s.authorName; $('sv-time').textContent = fmtTime(s.createdAt);
  $('sv-media').innerHTML = s.type === 'photo' && s.mediaUrl ? `<div><img src="${esc(s.mediaUrl)}" alt=""><p style="margin-top:10px;font-size:15px">${esc(s.text)}</p></div>` : s.type === 'video' && s.mediaUrl ? `<video src="${esc(s.mediaUrl)}" controls autoplay></video>` : `<div style="padding:26px;border-radius:18px;background:#131517">${esc(s.text)}</div>`;
  $('sv-footer').innerHTML = `<span class="muted" style="font-size:13px">Просмотров: ${s.viewers.length}</span><span style="flex:1"></span><button type="button" class="btn2" style="width:auto;padding:8px 14px" onclick="closeStoryViewer()">Закрыть</button>`;
  $('story-viewer').classList.remove('hidden');
  let p = 0; $('sv-progress').style.width = '0%'; clearInterval(storyTimer);
  storyTimer = setInterval(() => { p += 2; $('sv-progress').style.width = p + '%'; if (p >= 100) closeStoryViewer(); }, 100);
}
function closeStoryViewer() { clearInterval(storyTimer); $('story-viewer').classList.add('hidden'); }

// ==================== ЧАТЫ И ПЕРЕПИСКА ====================
function setFolder(f, el) { activeFolder = f; document.querySelectorAll('.folder').forEach(x => x.classList.remove('active')); el.classList.add('active'); renderChats(); }

function renderChats() {
  const list = chats.filter(c => activeFolder === 'archived' ? c.archived : (!c.archived && (activeFolder === 'all' || c.type === activeFolder))).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  $('chats-list').innerHTML = list.length ? list.map(c => {
    const last = c.messages[c.messages.length - 1];
    const sub = last ? (last.type === 'gift' ? `Подарок: ${last.giftSnapshot?.name || ''}` : last.type === 'photo' ? 'Фото' : last.type === 'video' ? 'Видео' : last.type === 'voice' ? 'Голосовое сообщение' : last.type === 'file' ? `Файл: ${last.fileName || ''}` : last.text) : 'Нет сообщений';
    const ava = c.type === 'saved' ? '<svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:#fff;fill:none;stroke-width:2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' : (c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : esc((c.title?.[0] || 'C').toUpperCase()));
    return `
      <button type="button" class="c-row" onclick="openChat('${esc(c.id)}')">
        <div class="ava" style="background:${esc(c.color || '#45c4cc')}">${ava}${c.peer?.online ? '<span class="online-dot"></span>' : ''}</div>
        <div class="c-mid">
          <div class="c-r1">
            <div class="c-title">${esc(c.title)} ${c.peer?.verified ? badgeHtml : ''}</div>
            <div class="c-meta-r">${last && last.senderId === currentUser.id ? `<span class="c-ticks">${doubleCheckSvg}</span>` : ''}<span>${last ? fmtTime(last.createdAt) : ''}</span>${c.pinned ? `<span class="c-pin">${pinSvg}</span>` : ''}</div>
          </div>
          <div class="c-r1" style="margin:0"><div class="c-sub">${esc(sub)}</div>${c.unread ? `<span class="badge-cnt">${c.unread}</span>` : ''}</div>
        </div>
      </button>`;
  }).join('') : '<div class="empty">Чатов пока нет</div>';
}

function openChatsMenu() {
  openModal(`<h3 style="margin-bottom:12px">Меню</h3><button type="button" class="btn1" style="margin-bottom:8px" onclick="closeModal();openNewChatModal()">Создать группу / канал</button><button type="button" class="btn2" onclick="closeModal();joinByCodePrompt()">Войти по коду</button>`);
}

function openNewChatModal() {
  newChatAva = null;
  const mem = contacts.map(u => `<label style="display:flex;gap:8px;padding:6px 0;font-size:13.5px"><input type="checkbox" class="nc-m" value="${esc(u.id)}"> ${esc(u.firstName)} ${esc(u.lastName)}</label>`).join('');
  openModal(`
    <h3 style="margin-bottom:12px">Создать группу / канал</h3>
    <button type="button" class="ava-up" onclick="$('nc-file').click()"><img id="nc-prev" class="hidden" alt=""><span id="nc-ph" class="ava-ph"><span>Фото</span></span></button>
    <input id="nc-file" type="file" accept="image/*" class="hidden" onchange="uploadAvatarFile(this,'nc-prev','nc-ph',v=>newChatAva=v)">
    <div class="fg"><select id="nc-t" class="tf"><option value="group">Группа</option><option value="channel">Канал</option></select><input id="nc-n" class="tf" placeholder="Название *"><input id="nc-d" class="tf" placeholder="Описание"><select id="nc-p" class="tf"><option value="true">Публичный</option><option value="false">Приватный</option></select></div>
    ${mem ? `<div style="max-height:120px;overflow-y:auto;margin-bottom:10px">${mem}</div>` : ''}
    <button type="button" class="btn1" onclick="createChatGroup()">Создать</button>
  `);
}

async function createChatGroup() {
  try {
    const res = await api('POST', '/api/chats/create', {
      type: $('nc-t').value, title: $('nc-n').value, description: $('nc-d').value,
      isPublic: $('nc-p').value === 'true', avatar: newChatAva,
      memberIds: Array.from(document.querySelectorAll('.nc-m:checked')).map(x => x.value)
    });
    newChatAva = null; chats.unshift(res.chat); closeModal(); renderChats(); openChat(res.chat.id);
  } catch (e) { showToast(e.message); }
}

function joinByCodePrompt() { openModal(`<h3 style="margin-bottom:12px">Код приглашения</h3><div class="fg"><input id="jc-i" class="tf" placeholder="ID или код"></div><button type="button" class="btn1" onclick="doJoin()">Вступить</button>`); }
async function doJoin() { try { const code = $('jc-i').value.trim(); const r = await api('POST', `/api/chats/${encodeURIComponent(code)}/join`, { inviteCode: code }); await refreshAllData(); closeModal(); openChat(r.chat.id); } catch (e) { showToast(e.message); } }

function openChat(id) {
  activeChatId = id; const c = chats.find(x => x.id === id); if (!c) return;
  c.unread = 0; api('POST', `/api/chats/${id}/read`).catch(() => {}); renderAll();
  $('r-name').innerHTML = `${esc(c.title)} ${c.peer?.verified ? badgeHtml : ''}`;
  $('r-sub').textContent = c.type === 'saved' ? 'облачное хранилище' : c.type === 'dm' ? fmtLast(c.peer) : `${c.members.length} участн.`;
  $('r-ava').style.background = c.color || '#45c4cc';
  $('r-ava').innerHTML = c.type === 'saved' ? '<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' : (c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : esc((c.title?.[0] || 'C').toUpperCase()));
  const canWrite = c.type !== 'channel' || (c.admins || []).includes(currentUser.id);
  $('r-composer-wrap').classList.toggle('hidden', !canWrite);
  $('r-readonly-bar').classList.toggle('hidden', canWrite);
  $('r-call-btn').classList.toggle('hidden', c.type !== 'dm');
  clearSelection(); cancelReply(); closeChatSearch(); renderPinnedBar(c); $('chat-room').classList.remove('hidden'); renderMessages();
}
function closeChat() { $('chat-room').classList.add('hidden'); $('sticker-tray').classList.add('hidden'); activeChatId = null; }
function renderPinnedBar(c) { const pm = c.pinnedMessageId ? c.messages.find(m => m.id === c.pinnedMessageId) : null; $('r-pinned-bar').classList.toggle('hidden', !pm); if (pm) $('r-pinned-txt').textContent = pm.text || 'Медиа'; }
async function unpinChatMsg() { try { await api('POST', `/api/chats/${activeChatId}/pin`, { msgId: null }); const c = chats.find(x => x.id === activeChatId); if (c) { c.pinnedMessageId = null; renderPinnedBar(c); } } catch (e) { showToast(e.message); } }
function scrollToPinned() { const c = chats.find(x => x.id === activeChatId); $('msg_' + c?.pinnedMessageId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

function renderMessages() {
  const c = chats.find(x => x.id === activeChatId); if (!c) return;
  const q = ($('r-search-inp').value || '').toLowerCase();
  const list = q ? c.messages.filter(m => (m.text || '').toLowerCase().includes(q)) : c.messages;
  const wrap = $('msgs-list'); wrap.innerHTML = '';
  list.forEach(m => {
    const el = document.createElement('div');
    if (m.type === 'system') { el.className = 'msg sys'; el.textContent = m.text || ''; wrap.appendChild(el); return; }
    const isOut = m.senderId === currentUser.id;
    const rep = m.replyToId ? c.messages.find(x => x.id === m.replyToId) : null;
    el.id = 'msg_' + m.id;
    el.className = `msg ${isOut ? 'out' : 'in'}${selectedMsgIds.has(m.id) ? ' selected' : ''}`;
    let h = '';
    if (!isOut && c.type === 'group') {
      const sender = c.members.find(x => x.id === m.senderId);
      if (sender) h += `<div style="font-size:12px;font-weight:700;color:var(--cyan);margin-bottom:2px">${esc(sender.name)}</div>`;
    }
    if (m.forwardedFrom) h += `<div class="muted" style="font-size:11px;margin-bottom:2px">↪ от ${esc(m.forwardedFrom)}</div>`;
    if (rep) h += `<div class="r-box">${esc(rep.text || 'Медиа')}</div>`;
    if (m.type === 'photo' && m.mediaUrl) h += `<img class="m-img" src="${esc(m.mediaUrl)}" alt="">`;
    if (m.type === 'video' && m.mediaUrl) h += `<video class="m-video" src="${esc(m.mediaUrl)}" controls></video>`;
    if (m.type === 'voice' && m.mediaUrl) h += `<audio controls src="${esc(m.mediaUrl)}" style="max-width:210px;height:34px"></audio>`;
    if (m.type === 'file' && m.mediaUrl) h += `<a href="${esc(m.mediaUrl)}" download="${esc(m.fileName || 'file')}" style="color:var(--cyan);font-weight:600;display:block;margin-bottom:4px">${esc(m.fileName || 'Файл')}</a>`;
    if (m.type === 'gift' && m.giftSnapshot) {
      const g = m.giftSnapshot;
      h += `<div style="padding:10px;border-radius:12px;background:${g.bg ? `linear-gradient(135deg,${g.bg[0]},${g.bg[1]})` : 'var(--card2)'};text-align:center;margin-bottom:4px"><div style="display:flex;justify-content:center;margin-bottom:4px">${giftImgHtml(g, 62)}</div><div style="font-weight:700;color:#fff;font-size:13px">${esc(g.name)} ${g.isNft ? '#' + g.num : ''}</div></div>`;
    }
    if (m.text) h += `<span>${esc(m.text).replace(/@(\w+)/g, '<span style="color:var(--cyan);font-weight:600">@$1</span>')}</span>`;
    h += `<span class="m-meta">${c.type === 'channel' ? `${m.views || 1} просм. · ` : ''}${m.edited ? 'изм. ' : ''}${fmtTime(m.createdAt)} ${isOut ? (m.readBy?.length > 1 ? '✓✓' : '✓') : ''}</span>`;
    el.innerHTML = h;
    const rEntries = Object.entries(m.reactions || {});
    if (rEntries.length) {
      const row = document.createElement('div'); row.className = 'r-row';
      rEntries.forEach(([em, ids]) => {
        const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'r-tag'; tag.textContent = `${em} ${ids.length}`;
        tag.onclick = ev => { ev.stopPropagation(); reactMsg(m.id, em); };
        row.appendChild(tag);
      });
      el.appendChild(row);
    }
    el.onclick = () => onMsgClick(m.id);
    wrap.appendChild(el);
  });
  wrap.scrollTop = wrap.scrollHeight;
}

function onMessageInput() {
  const has = $('m-inp').value.trim().length > 0;
  $('btn-voice').classList.toggle('hidden', has); $('btn-send').classList.toggle('hidden', !has);
  if (ws?.readyState === WebSocket.OPEN && activeChatId) {
    ws.send(JSON.stringify({ event: 'typing', payload: { chatId: activeChatId, isTyping: has } }));
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { if (ws?.readyState === WebSocket.OPEN && activeChatId) ws.send(JSON.stringify({ event: 'typing', payload: { chatId: activeChatId, isTyping: false } })); }, 2000);
  }
}

async function sendTextMessage() {
  const text = $('m-inp').value.trim(); if (!text || !activeChatId) return;
  const chatId = activeChatId, rep = replyToId;
  $('m-inp').value = ''; onMessageInput();
  try { const res = await api('POST', `/api/chats/${chatId}/messages`, { type: 'text', text, replyToId: rep }); cancelReply(); upsertChatMessage(chatId, res.message); }
  catch (e) { $('m-inp').value = text; onMessageInput(); showToast(e.message); }
}
function openAttachMenu() { openModal(`<h3 style="margin-bottom:12px">Прикрепить</h3><button type="button" class="btn1" style="margin-bottom:8px" onclick="closeModal();$('c-media-file').click()">Фото / Видео</button><button type="button" class="btn2" onclick="closeModal();$('c-doc-file').click()">Файл</button>`); }
function uploadChatMedia(inp) {
  const f = inp.files?.[0]; if (!f || !activeChatId) return;
  if (f.size > MAX_UPLOAD_BYTES) { showToast('Файл больше 12 МБ'); inp.value = ''; return; }
  const chatId = activeChatId, rep = replyToId, r = new FileReader();
  r.onload = async e => { try { const up = await api('POST','/api/upload',{dataUrl:e.target.result,fileName:f.name}); const res = await api('POST',`/api/chats/${chatId}/messages`,{type:f.type.startsWith('video')?'video':'photo',mediaUrl:up.url,fileName:f.name,replyToId:rep}); cancelReply(); upsertChatMessage(chatId, res.message); } catch (err) { showToast(err.message); } };
  r.readAsDataURL(f); inp.value = '';
}
function uploadChatDoc(inp) {
  const f = inp.files?.[0]; if (!f || !activeChatId) return;
  if (f.size > MAX_UPLOAD_BYTES) { showToast('Файл больше 12 МБ'); inp.value = ''; return; }
  const chatId = activeChatId, rep = replyToId, r = new FileReader();
  r.onload = async e => { try { const up = await api('POST','/api/upload',{dataUrl:e.target.result,fileName:f.name}); const res = await api('POST',`/api/chats/${chatId}/messages`,{type:'file',mediaUrl:up.url,fileName:f.name,replyToId:rep}); cancelReply(); upsertChatMessage(chatId, res.message); } catch (err) { showToast(err.message); } };
  r.readAsDataURL(f); inp.value = '';
}
async function toggleVoiceRecord() {
  const btn = $('btn-voice'); if (!activeChatId) return;
  if (mediaRecorder?.state === 'recording') { mediaRecorder.stop(); btn.classList.remove('recording'); return; }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return showToast('Запись не поддерживается');
  const chatId = activeChatId;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream); mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop()); const fr = new FileReader();
      fr.onload = async ev => { try { const up = await api('POST','/api/upload',{dataUrl:ev.target.result,fileName:'voice.webm'}); const res = await api('POST',`/api/chats/${chatId}/messages`,{type:'voice',mediaUrl:up.url}); upsertChatMessage(chatId, res.message); } catch (err) { showToast(err.message); } };
      fr.readAsDataURL(new Blob(recordedChunks, { type: 'audio/webm' }));
    };
    mediaRecorder.start(); btn.classList.add('recording'); showToast('Запись... Нажмите снова для отправки');
  } catch { showToast('Нет доступа к микрофону'); }
}
function toggleStickers() {
  const tray = $('sticker-tray'); tray.classList.toggle('hidden');
  if (!tray.innerHTML) STICKERS.forEach(s => {
    const b = document.createElement('button'); b.type = 'button'; b.style.fontSize = '24px'; b.textContent = s;
    b.onclick = async () => { if (!activeChatId) return; tray.classList.add('hidden'); try { const res = await api('POST',`/api/chats/${activeChatId}/messages`,{type:'text',text:s}); upsertChatMessage(activeChatId, res.message); } catch (e) { showToast(e.message); } };
    tray.appendChild(b);
  });
}
function onMsgClick(mid) {
  if (selectedMsgIds.size > 0) return toggleSelectMsg(mid);
  const c = chats.find(x => x.id === activeChatId), m = c?.messages.find(x => x.id === mid); if (!m) return;
  const isOut = m.senderId === currentUser.id, canDelAll = isOut || (c.admins || []).includes(currentUser.id);
  openModal(`
    <div style="display:flex;justify-content:space-around;font-size:24px;margin-bottom:14px">${REACTS.map(r=>`<button type="button" style="font-size:24px" onclick="reactMsg('${esc(mid)}','${esc(r)}');closeModal()">${r}</button>`).join('')}</div>
    <button type="button" class="btn2" style="margin-bottom:6px" onclick="replyMsg('${esc(mid)}')">Ответить</button>
    <button type="button" class="btn2" style="margin-bottom:6px" onclick="copyMsg('${esc(mid)}')">Копировать</button>
    <button type="button" class="btn2" style="margin-bottom:6px" onclick="pinMsg('${esc(mid)}')">Закрепить</button>
    <button type="button" class="btn2" style="margin-bottom:6px" onclick="closeModal();toggleSelectMsg('${esc(mid)}')">Выбрать</button>
    ${isOut && m.text ? `<button type="button" class="btn2" style="margin-bottom:6px" onclick="editMsgPrompt('${esc(mid)}')">Изменить</button>` : ''}
    <button type="button" class="btn2" style="color:var(--red);margin-bottom:6px" onclick="delMsg('${esc(mid)}',false)">Удалить у себя</button>
    ${canDelAll ? `<button type="button" class="btn2" style="color:var(--red)" onclick="delMsg('${esc(mid)}',true)">Удалить у всех</button>` : ''}
  `);
}
async function reactMsg(mid, emoji) { try { const r = await api('POST', `/api/chats/${activeChatId}/messages/${mid}/react`, { emoji }); const m = chats.find(x => x.id === activeChatId)?.messages.find(x => x.id === mid); if (m) { m.reactions = r.reactions; renderMessages(); } } catch (e) { showToast(e.message); } }
function replyMsg(mid) { const m = chats.find(x => x.id === activeChatId)?.messages.find(x => x.id === mid); if (!m) return; replyToId = mid; $('r-reply-txt').textContent = m.text || 'Медиа'; $('r-reply-bar').classList.remove('hidden'); closeModal(); }
function cancelReply() { replyToId = null; $('r-reply-bar').classList.add('hidden'); }
function copyMsg(mid) { copyTxt(chats.find(x => x.id === activeChatId)?.messages.find(x => x.id === mid)?.text || ''); closeModal(); }
async function pinMsg(mid) { try { const r = await api('POST', `/api/chats/${activeChatId}/pin`, { msgId: mid }); const c = chats.find(x => x.id === activeChatId); if (c) { c.pinnedMessageId = r.pinnedMessageId; renderPinnedBar(c); } closeModal(); } catch (e) { showToast(e.message); } }
function editMsgPrompt(mid) { const m = chats.find(x => x.id === activeChatId)?.messages.find(x => x.id === mid); openModal(`<h3 style="margin-bottom:10px">Редактировать</h3><div class="fg"><input id="em-i" class="tf" value="${esc(m?.text || '')}"></div><button type="button" class="btn1" onclick="saveEditMsg('${esc(mid)}')">Сохранить</button>`); }
async function saveEditMsg(mid) { try { const r = await api('PATCH', `/api/chats/${activeChatId}/messages/${mid}`, { text: $('em-i').value }); const m = chats.find(x => x.id === activeChatId)?.messages.find(x => x.id === mid); if (m && r.message) { m.text = r.message.text; m.edited = true; renderMessages(); renderChats(); } closeModal(); } catch (e) { showToast(e.message); } }
async function delMsg(mid, forAll) { try { await api('DELETE', `/api/chats/${activeChatId}/messages/${mid}`, { forAll }); const c = chats.find(x => x.id === activeChatId); if (c) c.messages = c.messages.filter(m => m.id !== mid); closeModal(); renderMessages(); renderChats(); } catch (e) { showToast(e.message); } }
function toggleSelectMsg(mid) { if (selectedMsgIds.has(mid)) selectedMsgIds.delete(mid); else selectedMsgIds.add(mid); $('r-select-bar').classList.toggle('hidden', selectedMsgIds.size === 0); $('r-select-count').textContent = `Выбрано: ${selectedMsgIds.size}`; renderMessages(); }
function clearSelection() { selectedMsgIds.clear(); $('r-select-bar').classList.add('hidden'); renderMessages(); }
function forwardSelected() { const writable = chats.filter(c => c.type !== 'channel' || (c.admins || []).includes(currentUser.id)); openModal(`<h3 style="margin-bottom:10px">Переслать в чат</h3>` + writable.map(c => `<button type="button" class="c-row" onclick="doForward('${esc(c.id)}')"><span>${esc(c.title)}</span></button>`).join('')); }
async function doForward(tid) {
  const src = chats.find(x => x.id === activeChatId); if (!src) return;
  try {
    for (const id of selectedMsgIds) {
      const m = src.messages.find(x => x.id === id); if (!m) continue;
      await api('POST', `/api/chats/${tid}/messages`, { type: m.type === 'gift' ? 'text' : m.type, text: m.type === 'gift' ? `Подарок: ${m.giftSnapshot?.name || ''}` : (m.text || ''), mediaUrl: m.mediaUrl, fileName: m.fileName, forwardedFrom: src.title });
    }
    clearSelection(); closeModal(); showToast('Переслано');
  } catch (e) { showToast(e.message); }
}
async function deleteSelected() { try { for (const id of selectedMsgIds) await api('DELETE', `/api/chats/${activeChatId}/messages/${id}`, { forAll: false }); const c = chats.find(x => x.id === activeChatId); if (c) c.messages = c.messages.filter(m => !selectedMsgIds.has(m.id)); clearSelection(); renderMessages(); renderChats(); } catch (e) { showToast(e.message); } }
function openChatSearch() { $('r-search-bar').classList.remove('hidden'); $('r-search-inp').focus(); }
function closeChatSearch() { $('r-search-bar').classList.add('hidden'); $('r-search-inp').value = ''; renderMessages(); }
function openChatOptions() { const c = chats.find(x => x.id === activeChatId); if (!c) return; openModal(`<h3 style="margin-bottom:12px">Настройки чата</h3><button type="button" class="btn2" style="margin-bottom:8px" onclick="toggleChatPref('pinChat',${!c.pinned})">${c.pinned ? 'Открепить чат' : 'Закрепить чат'}</button><button type="button" class="btn2" style="margin-bottom:8px" onclick="toggleChatPref('mute',${!c.muted})">${c.muted ? 'Включить звук' : 'Без звука'}</button><button type="button" class="btn2" onclick="toggleChatPref('archive',${!c.archived})">${c.archived ? 'Из архива' : 'В архив'}</button>`); }
async function toggleChatPref(k, v) { try { const r = await api('PATCH', `/api/chats/${activeChatId}/prefs`, { [k]: v }); const i = chats.findIndex(x => x.id === activeChatId); if (i >= 0) chats[i] = r.chat; closeModal(); renderChats(); showToast('Обновлено'); } catch (e) { showToast(e.message); } }
function openActiveChatInfo() { const c = chats.find(x => x.id === activeChatId); if (!c) return; if (c.type === 'dm' && c.peer) openPeerProfile(c.peer.id); else openModal(`<h3>${esc(c.title)}</h3><p class="muted" style="margin:6px 0 12px">${esc(c.description || (c.type === 'channel' ? 'Канал' : 'Группа'))}</p>${c.inviteCode ? `<div class="card-blk" style="margin:0 0 10px;padding:12px 16px">Код: <b>${esc(c.inviteCode)}</b></div>` : ''}${c.members.map(m => `<div style="padding:8px 0;border-bottom:1px solid var(--div)">${esc(m.name)}</div>`).join('')}`); }

// ==================== КОНТАКТЫ, ПРОФИЛЬ СОБЕСЕДНИКА, ПОИСК ====================
function renderContacts() {
  const q = ($('contacts-search')?.value || '').toLowerCase();
  const list = contacts.filter(u => (`${u.firstName} ${u.lastName} ${u.username} ${u.phone || ''}`).toLowerCase().includes(q));
  $('contacts-list').innerHTML = list.length ? list.map(u => `<button type="button" class="c-row" onclick="openPeerProfile('${esc(u.id)}')"><div class="ava" style="background:${esc(u.color||'#45c4cc')}">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc((u.firstName?.[0] || 'U').toUpperCase())}${u.online ? '<span class="online-dot"></span>' : ''}</div><div class="c-mid"><div class="c-title">${esc(u.firstName)} ${esc(u.lastName)} ${u.verified ? badgeHtml : ''}</div><div class="c-sub">${esc(fmtLast(u))}</div></div></button>`).join('') : '<div class="empty">Контактов пока нет</div>';
  $('blocked-section').classList.toggle('hidden', blockedUsers.length === 0);
  $('blocked-list').innerHTML = blockedUsers.map(u => `<button type="button" class="c-row" onclick="toggleBlockPeer('${esc(u.id)}')"><div class="ava" style="background:#555">${esc((u.firstName?.[0] || 'U').toUpperCase())}</div><div class="c-mid"><div class="c-title">${esc(u.firstName)} ${esc(u.lastName)}</div><div class="c-sub" style="color:var(--red)">Разблокировать</div></div></button>`).join('');
}
function openAddContactModal() { openModal(`<h3 style="margin-bottom:12px">Добавить контакт</h3><div class="fg"><input id="ac-q" class="tf" placeholder="Телефон или @username"></div><button type="button" class="btn1" onclick="doAddContact()">Добавить</button>`); }
async function doAddContact() { try { await api('POST', '/api/contacts', { query: $('ac-q').value }); closeModal(); await refreshAllData(); showToast('Контакт добавлен'); } catch (e) { showToast(e.message); } }

async function openPeerProfile(uid) {
  if (uid === currentUser.id) { closeChat(); switchTab('profile'); return; }
  try {
    const res = await api('GET', `/api/users/${uid}`), u = res.user;
    const pos = ['top:14px;left:12px;','top:2px;left:52px;','bottom:10px;left:24px;','top:2px;right:52px;','top:14px;right:12px;','bottom:10px;right:24px;'];
    const orb = (u.gifts || []).filter(g => g.pinned && g.isNft).slice(0, 6).map((g, i) => `<div class="orb-gift" style="${pos[i]}">${giftImgHtml(g, 24)}</div>`).join('');
    const ava = u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc((u.firstName?.[0] || 'U').toUpperCase());
    $('peer-more-btn').onclick = () => openModal(`<button type="button" class="btn2" style="margin-bottom:8px" onclick="closeModal();toggleBlockPeer('${esc(u.id)}')">${res.isBlocked ? 'Разблокировать' : 'Заблокировать'}</button><button type="button" class="btn2" style="color:var(--red)" onclick="closeModal();reportPeer('${esc(u.id)}')">Пожаловаться</button>`);
    $('peer-profile-body').innerHTML = `
      <div class="p-hero"><div class="orbit-box">${orb}<div class="orbit-ava" style="background:${esc(u.color||'#1c1f22')}">${ava}</div></div>
        <div class="p-name">${esc(u.firstName)} ${esc(u.lastName)} ${u.verified ? badgeHtml : ''}</div>
        <div class="status-row">${esc(fmtLast(u))}</div>
      </div>
      <div class="p-actions">
        <button type="button" class="p-act" onclick="startDm('${esc(u.id)}')"><svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/></svg>Написать</button>
        <button type="button" class="p-act" onclick="toggleContactPeer('${esc(u.id)}',${res.isContact})"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>${res.isContact ? 'Удалить' : 'В контакты'}</button>
        <button type="button" class="p-act" id="peer-share-btn"><svg viewBox="0 0 24 24"><path d="M4 12v8h16v-8M12 15V3m0 0-4 4m4-4 4 4"/></svg>Поделиться</button>
      </div>
      ${res.channel ? `<button type="button" class="card-blk" style="width:calc(100% - 28px);text-align:left;padding:12px 16px" onclick="closePeerProfile();joinOrOpen('${esc(res.channel.id)}',false)"><div class="sec-hdr" style="padding:0 0 4px">Канал • ${res.channel.subscribers} подп.</div><div class="info-v">${esc(res.channel.title)}</div></button>` : ''}
      <div class="card-blk">
        ${u.phone ? `<button type="button" class="info-item" id="peer-c-ph"><div class="info-v">${esc(u.phone)}</div><div class="info-l">Телефон</div></button>` : ''}
        <div class="info-item"><div class="info-v">${esc(u.bio || 'Описание не добавлено')}</div><div class="info-l">О себе</div></div>
        ${u.username ? `<button type="button" class="info-item" id="peer-c-un"><div class="info-v">${esc(u.username)}</div><div class="info-l">Имя пользователя</div></button>` : ''}
        ${u.birthday ? `<div class="info-item"><div class="info-v">${esc(u.birthday)}</div><div class="info-l">День рождения</div></div>` : ''}
      </div>
      <div class="sec-hdr" style="padding:6px 16px">Подарки (${u.giftsHidden ? 'скрыты' : u.gifts.length})</div>
      ${!u.giftsHidden && u.gifts.length ? `<div class="g-grid">${u.gifts.map(g => `<div class="g-card" style="background:linear-gradient(155deg,${g.bg[0]},${g.bg[1]})"><div class="g-pat"></div>${g.isNft ? `<span class="g-ribbon">#${g.num}</span>` : ''}<div class="g-img-box">${giftImgHtml(g, 58)}</div></div>`).join('')}</div>` : ''}
      <div class="card-blk"><button type="button" class="set-row" onclick="toggleBlockPeer('${esc(u.id)}')"><span style="color:var(--red);font-weight:600">${res.isBlocked ? 'Разблокировать' : 'Заблокировать пользователя'}</span></button><button type="button" class="set-row" onclick="reportPeer('${esc(u.id)}')"><span style="color:var(--red)">Пожаловаться</span></button></div>`;
    $('peer-share-btn').onclick = () => copyTxt(u.username || u.id);
    if ($('peer-c-ph')) $('peer-c-ph').onclick = () => copyTxt(u.phone);
    if ($('peer-c-un')) $('peer-c-un').onclick = () => copyTxt(u.username);
    $('peer-profile-screen').classList.remove('hidden');
  } catch (e) { showToast(e.message); }
}
function closePeerProfile() { $('peer-profile-screen').classList.add('hidden'); }
async function startDm(pid) { try { const r = await api('POST', '/api/chats/dm', { peerId: pid }); closePeerProfile(); await refreshAllData(); openChat(r.chat.id); } catch (e) { showToast(e.message); } }
async function toggleContactPeer(uid, isC) { try { if (isC) await api('DELETE', `/api/contacts/${uid}`); else await api('POST', '/api/contacts', { query: uid }); await refreshAllData(); openPeerProfile(uid); } catch (e) { showToast(e.message); } }
async function toggleBlockPeer(uid) { try { const r = await api('POST', `/api/users/${uid}/block`); await refreshAllData(); showToast(r.blocked ? 'Заблокирован' : 'Разблокирован'); if (!$('peer-profile-screen').classList.contains('hidden')) openPeerProfile(uid); } catch (e) { showToast(e.message); } }
async function reportPeer(uid) { try { await api('POST', `/api/users/${uid}/report`, { reason: 'Жалоба' }); showToast('Жалоба отправлена'); } catch (e) { showToast(e.message); } }

function openGlobalSearch() { $('global-search-screen').classList.remove('hidden'); $('gs-input').focus(); }
function closeGlobalSearch() { $('global-search-screen').classList.add('hidden'); }
async function runGlobalSearch() {
  const q = $('gs-input').value.trim(), seq = ++searchSeq;
  if (!q) { $('gs-results').innerHTML = ''; return; }
  try {
    const res = await api('GET', '/api/search?q=' + encodeURIComponent(q));
    if (seq !== searchSeq) return;
    let h = '';
    if (res.users.length) h += '<div class="sec-hdr" style="padding:8px 16px">Люди</div>' + res.users.map(u => `<button type="button" class="c-row" onclick="closeGlobalSearch();openPeerProfile('${esc(u.id)}')"><div class="ava sm" style="background:${esc(u.color||'#45c4cc')}">${esc(u.firstName[0])}</div><div class="c-mid"><div class="c-title">${esc(u.firstName)} ${esc(u.lastName)}</div><div class="c-sub">${esc(u.username || 'Без username')}</div></div></button>`).join('');
    if (res.chats.length) h += '<div class="sec-hdr" style="padding:8px 16px">Чаты и каналы</div>' + res.chats.map(c => `<button type="button" class="c-row" onclick="closeGlobalSearch();joinOrOpen('${esc(c.id)}',${c.isMember})"><div class="ava sm" style="background:#45c4cc">${esc(c.title[0])}</div><div class="c-mid"><div class="c-title">${esc(c.title)}</div><div class="c-sub">${esc(c.type)} • ${c.membersCount} участн.</div></div></button>`).join('');
    if (res.messages.length) h += '<div class="sec-hdr" style="padding:8px 16px">Сообщения</div>' + res.messages.map(m => `<button type="button" class="c-row" onclick="closeGlobalSearch();openChat('${esc(m.chatId)}')"><div class="c-mid"><div class="c-title">${esc(m.chatTitle)}</div><div class="c-sub">${esc(m.text)}</div></div></button>`).join('');
    $('gs-results').innerHTML = h || '<div class="empty">Ничего не найдено</div>';
  } catch (e) { showToast(e.message); }
}
async function joinOrOpen(cid, isM) { try { if (!isM) await api('POST', `/api/chats/${cid}/join`, {}); await refreshAllData(); openChat(cid); } catch (e) { showToast(e.message); } }

// ==================== ПРОФИЛЬ, НАСТРОЙКИ И ПОДЭКРАНЫ ====================
function renderSettings() {
  const u = currentUser, ava = u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc((u.firstName?.[0] || 'C').toUpperCase());
  $('set-hero').innerHTML = `
    <div class="ava-wrap"><div class="ava lg" style="background:${esc(u.color||'#45c4cc')}">${ava}</div>
      <button type="button" class="cam-badge" onclick="$('quick-ava-file').click()" aria-label="Фото"><svg viewBox="0 0 24 24"><path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3.5"/></svg></button>
    </div>
    <div class="p-name">${esc(u.firstName)} ${esc(u.lastName)} ${u.verified ? badgeHtml : ''}</div>
    <div class="status-row" style="margin-top:3px">${esc(u.phone)}${u.username ? ' • ' + esc(u.username) : ''}</div>`;
  $('set-stars').textContent = (u.stars || 0).toLocaleString('ru-RU');
  $('set-ccoins').textContent = (u.ton || 0).toLocaleString('ru-RU');
  $('set-prem-sub').textContent = u.premium ? 'Активен' : 'Эксклюзивные возможности';
  $('owner-blk').classList.toggle('hidden', !u.isAdmin);
}

function renderProfile() {
  const u = currentUser, ava = u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc((u.firstName?.[0] || 'C').toUpperCase());
  const pos = ['top:14px;left:12px;','top:2px;left:52px;','bottom:10px;left:24px;','top:2px;right:52px;','top:14px;right:12px;','bottom:10px;right:24px;'];
  const pinnedOrbit = myGifts.filter(g => g.pinned && g.isNft).slice(0, 6);
  const lvl = getRatingLevel(calcRatingFromHistory());
  $('profile-hero').innerHTML = `
    <div class="orbit-box">${pinnedOrbit.map((g, i) => `<div class="orb-gift" style="${pos[i]}">${giftImgHtml(g, 24)}</div>`).join('')}<div class="orbit-ava" style="background:${esc(u.color||'#1c1f22')}">${ava}</div></div>
    <div class="p-name">${esc(u.firstName)} ${esc(u.lastName)} ${u.verified ? badgeHtml : ''}</div>
    <div class="status-row"><button type="button" class="rating-pill" onclick="openRatingSheet()">${lvl}</button><span>в сети · ${myGifts.length} подарков</span></div>`;

  $('profile-info-card').innerHTML = `
    <button type="button" class="info-item" id="pr-cp"><div class="info-v">${esc(u.phone)}</div><div class="info-l">Телефон</div></button>
    <div class="info-item"><div class="info-v">${esc(u.bio || 'Описание не добавлено')}</div><div class="info-l">О себе</div></div>
    <div class="info-item"><div class="info-v">${esc(u.username || 'Username не указан')}</div><div class="info-l">Имя пользователя</div></div>
    ${u.birthday ? `<div class="info-item"><div class="info-v">${esc(u.birthday)}</div><div class="info-l">День рождения</div></div>` : ''}
    ${u.address ? `<div class="info-item"><div class="info-v">${esc(u.address)}</div><div class="info-l">Адрес</div></div>` : ''}`;
  if ($('pr-cp')) $('pr-cp').onclick = () => copyTxt(u.phone);

  $('tab-gifts-mini').innerHTML = pinnedOrbit.slice(0, 3).map(g => giftImgHtml(g, 14)).join('');
  const sorted = [...myGifts].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  $('profile-gifts-grid').innerHTML = sorted.length ? sorted.map(g => `
    <button type="button" class="g-card" style="background:linear-gradient(155deg,${g.bg[0]},${g.bg[1]})" onclick="viewMyGift('${esc(g.uid)}')">
      <div class="g-pat"></div>
      ${g.pinned ? `<span class="g-pin">${pinSvg}</span>` : ''}
      ${g.forSale ? '<span class="g-ribbon sale">продаётся</span>' : (g.isNft ? `<span class="g-ribbon">#${g.num}</span>` : '')}
      <div class="g-img-box">${giftImgHtml(g, 58)}</div>
      ${g.forSale ? `<div class="g-price-pill">${starMiniSvg}${g.salePrice}</div>` : `<div class="g-name-sm">${esc(g.name)}</div>`}
    </button>`).join('') : '<div class="empty" style="grid-column:span 3">Подарков пока нет</div>';

  const saved = stories.filter(s => s.userId === u.id && s.savedToProfile);
  $('saved-stories-grid').innerHTML = saved.length ? saved.map(s => `<div class="g-card" style="padding:8px;font-size:12px">${esc(s.text || 'История')}</div>`).join('') : '<div class="empty" style="grid-column:span 3">Сохранённых историй нет</div>';
}

function setProfileTab(t) { $('p-tab-posts').classList.toggle('hidden', t !== 'posts'); $('p-tab-gifts').classList.toggle('hidden', t !== 'gifts'); $('ps-posts').classList.toggle('active', t === 'posts'); $('ps-gifts').classList.toggle('active', t === 'gifts'); }
function quickAvatarChange(inp) { uploadAvatarFile(inp, null, null, async url => { try { const r = await api('PATCH', '/api/profile', { avatar: url }); currentUser = r.user; renderAll(); showToast('Фото обновлено'); } catch (e) { showToast(e.message); } }); }

function openAccountSubscreen() {
  const u = currentUser; editAva = u.avatar;
  openSubscreen('Аккаунт', `
    <div style="padding:10px 0;text-align:center">
      <button type="button" class="ava-up" onclick="$('ep-f').click()"><img id="ep-p" src="${esc(u.avatar||'')}" class="${u.avatar?'':'hidden'}" alt=""><span id="ep-ph" class="ava-ph ${u.avatar?'hidden':''}"><span>Фото</span></span></button>
      <button type="button" id="ep-clear-btn" class="link-btn ${u.avatar?'':'hidden'}" style="font-size:12px;margin-bottom:8px">Удалить фото</button>
      <input id="ep-f" type="file" accept="image/*" class="hidden" onchange="uploadAvatarFile(this,'ep-p','ep-ph',v=>{editAva=v;$('ep-clear-btn')?.classList.remove('hidden')})">
    </div>
    <div class="sub-caption" style="color:var(--cyan);font-weight:700">Ваше имя</div>
    <div class="fg" style="margin:0 14px 12px"><input id="ep-fn" class="tf" placeholder="Имя" value="${esc(u.firstName)}"><input id="ep-ln" class="tf" placeholder="Фамилия" value="${esc(u.lastName)}"></div>
    <div class="fg" style="margin:0 14px 6px"><input id="ep-bio" class="tf" maxlength="128" placeholder="О себе" value="${esc(u.bio)}"></div>
    <div class="sub-caption">Описание профиля (<span id="bio-left">128</span>).</div>
    <div class="card-blk">
      <div class="sec-hdr">Информация о Вас</div>
      <div class="info-item"><div class="info-v">${esc(u.phone)}</div><div class="info-l">Телефон</div></div>
      <div class="info-item"><input id="ep-un" class="tf" style="padding:4px 0" placeholder="@username" value="${esc(u.username)}"><div class="info-l">Имя пользователя</div></div>
      <div class="info-item"><input id="ep-bd" class="tf" style="padding:4px 0" placeholder="День рождения" value="${esc(u.birthday)}"><div class="info-l">День рождения</div></div>
      <div class="info-item"><input id="ep-ad" class="tf" style="padding:4px 0" placeholder="Адрес" value="${esc(u.address)}"><div class="info-l">Адрес</div></div>
    </div>
    <div style="padding:0 14px"><button type="button" class="btn1" onclick="saveProfile()">Сохранить</button></div>
  `);
  const upd = () => $('bio-left').textContent = 128 - ($('ep-bio').value || '').length;
  $('ep-bio').oninput = upd; upd();
  $('ep-clear-btn').onclick = () => { editAva = null; $('ep-p').src = ''; $('ep-p').classList.add('hidden'); $('ep-ph').classList.remove('hidden'); $('ep-clear-btn').classList.add('hidden'); };
}
async function saveProfile() {
  try {
    const r = await api('PATCH', '/api/profile', { firstName: $('ep-fn').value, lastName: $('ep-ln').value, username: $('ep-un').value, bio: $('ep-bio').value, birthday: $('ep-bd').value, address: $('ep-ad').value, avatar: editAva });
    currentUser = r.user; closeSubscreen(); renderAll(); showToast('Профиль сохранён');
  } catch (e) { showToast(e.message); }
}

function openChatAppearanceModal() {
  const s = currentUser.settings || {};
  openModal(`<h3 style="margin-bottom:12px">Оформление</h3><div class="fg"><select id="ap-th" class="tf"><option value="dark" ${s.theme!=='light'?'selected':''}>Тёмная тема</option><option value="light" ${s.theme==='light'?'selected':''}>Светлая тема</option></select><select id="ap-fs" class="tf"><option value="14" ${s.fontSize===14?'selected':''}>Текст 14px</option><option value="15" ${!s.fontSize||s.fontSize===15?'selected':''}>Текст 15px</option><option value="17" ${s.fontSize===17?'selected':''}>Текст 17px</option></select></div><button type="button" class="btn1" onclick="saveAppearance()">Применить</button>`);
}
async function saveAppearance() { try { const r = await api('PATCH', '/api/profile/settings', { theme: $('ap-th').value, fontSize: parseInt($('ap-fs').value, 10) }); currentUser.settings = r.settings; applySettings(); closeModal(); showToast('Обновлено'); } catch (e) { showToast(e.message); } }
async function toggleUserSetting(k) { try { const r = await api('PATCH', '/api/profile/settings', { [k]: currentUser.settings?.[k] === false }); currentUser.settings = r.settings; applySettings(); showToast('Обновлено'); } catch (e) { showToast(e.message); } }

function openPrivacySubscreen() {
  const p = currentUser.privacy || {};
  const row = (id, lbl, val) => `<div class="set-row"><span class="set-txt"><div class="set-t">${lbl}</div></span><select id="${id}" class="tf" style="width:auto;padding:4px 0;color:var(--cyan);font-weight:600;text-align:right"><option value="everybody" ${val==='everybody'?'selected':''}>Все</option><option value="contacts" ${val==='contacts'?'selected':''}>Контакты</option><option value="nobody" ${val==='nobody'?'selected':''}>Никто</option></select></div>`;
  openSubscreen('Конфиденциальность', `
    <div class="card-blk" style="margin-top:8px">
      <div class="sec-hdr">Безопасность</div>
      <button type="button" class="set-row" onclick="openSecurityModal()"><span class="set-txt"><div class="set-t">Пароль, номер и 2FA</div></span><span class="cyan-val">Изменить</span></button>
      <button type="button" class="set-row" onclick="openSessionsModal()"><span class="set-txt"><div class="set-t">Устройства</div></span><span class="cyan-val">Открыть</span></button>
    </div>
    <div class="card-blk">
      <div class="sec-hdr">Конфиденциальность</div>
      ${row('pr-ph','Номер телефона',p.phone)}${row('pr-ls','Время захода',p.lastSeen)}${row('pr-bd','День рождения',p.birthday)}
      ${row('pr-ms','Кто пишет мне',p.messages)}${row('pr-gr','Приглашения в группы',p.groups)}${row('pr-gf','Мои подарки',p.gifts)}
    </div>
    <div style="padding:0 14px"><button type="button" class="btn1" onclick="savePrivacy()">Сохранить приватность</button></div>
  `);
}
async function savePrivacy() { try { const r = await api('PATCH', '/api/profile/privacy', { phone:$('pr-ph').value, lastSeen:$('pr-ls').value, birthday:$('pr-bd').value, messages:$('pr-ms').value, groups:$('pr-gr').value, gifts:$('pr-gf').value }); currentUser.privacy = r.privacy; showToast('Приватность сохранена'); } catch (e) { showToast(e.message); } }
function openSecurityModal() { openModal(`<h3 style="margin-bottom:12px">Безопасность</h3><div class="fg"><input id="sec-cur" class="tf" type="password" placeholder="Текущий пароль *"><input id="sec-ph" class="tf" placeholder="Новый номер"><input id="sec-np" class="tf" type="password" placeholder="Новый пароль"><input id="sec-nc" class="tf" type="password" placeholder="Новый облачный пароль"></div><button type="button" class="btn1" onclick="saveSecurity()">Обновить</button>`); }
async function saveSecurity() { try { const r = await api('PATCH', '/api/profile/security', { currentPassword:$('sec-cur').value, newPhone:$('sec-ph').value||undefined, newPassword:$('sec-np').value||undefined, newCloudPassword:$('sec-nc').value||undefined }); currentUser = r.user; closeModal(); renderAll(); showToast('Данные обновлены'); } catch (e) { showToast(e.message); } }

async function openSessionsModal() { try { const r = await api('GET', '/api/auth/sessions'); openModal(`<h3 style="margin-bottom:12px">Устройства</h3>` + r.sessions.map(s => `<div class="card-blk" style="margin:0 0 8px;padding:10px 14px"><b>${s.current ? 'Текущее устройство' : 'Сессия'}</b><div class="muted" style="font-size:12px">${esc(s.device)} • ${fmtTime(s.lastActive)}</div></div>`).join('')); } catch (e) { showToast(e.message); } }
function openSettingsMoreMenu() { openModal(`<button type="button" class="btn2" style="color:var(--red)" onclick="closeModal();logout()">Выйти из аккаунта</button>`); }
function openQrModal() { openModal(`<div style="text-align:center;padding:12px 0"><div class="cw-logo" style="margin:0 auto 12px">C</div><h3>${esc(currentUser.firstName)} ${esc(currentUser.lastName)}</h3><p class="muted" style="margin:6px 0 14px">${esc(currentUser.username || currentUser.phone)}</p><button type="button" class="btn2" id="qr-cp">Копировать контакт</button></div>`); $('qr-cp').onclick = () => copyTxt(currentUser.username || currentUser.id); }
function openAboutModal() { openModal(`<div style="text-align:center;padding:12px 0"><div class="cw-logo" style="margin:0 auto 12px">C</div><h3>CW-Gram v1.0</h3><p class="muted" style="margin-top:8px;font-size:13.5px">Мессенджер в реальном времени на Express и WebSocket.</p></div>`); }
function openPremiumModal() { openModal(`<div style="text-align:center;padding:12px 0"><h3>CW-Gram Premium</h3><p class="muted" style="margin:8px 0">Статус: <b>${currentUser.premium ? 'Активен' : 'Не активен'}</b></p></div>`); }

// ==================== ЗВЁЗДЫ, C-COINS, МАГАЗИН И МАРКЕТ ====================
function openStarsSubscreen(filter = 'all') {
  const hist = (currentUser.starHistory || []).filter(h => filter === 'all' ? true : filter === 'in' ? String(h.amount).startsWith('+') : String(h.amount).startsWith('-'));
  openSubscreen('Звёзды CW-Gram', `
    <div class="wallet-hero">
      <div class="wallet-glow"><svg viewBox="0 0 120 120" style="width:94px;height:94px;filter:drop-shadow(0 0 22px rgba(251,191,36,.4))"><defs><linearGradient id="stB" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fef08a"/><stop offset=".5" stop-color="#fbbf24"/><stop offset="1" stop-color="#d97706"/></linearGradient></defs><path d="m60 12 13.5 29.5L106 46 82.5 68.5 88.5 101 60 85 31.5 101 37.5 68.5 14 46l32.5-4.5Z" fill="url(#stB)" stroke="#fff7cc" stroke-width="2"/></svg></div>
      <h2>Звёзды CW-Gram</h2><p>Для покупки подарков, коллекционных NFT и оплаты на Маркете.</p>
    </div>
    <div class="wallet-card">
      <div class="wallet-amt tabular">${(currentUser.stars || 0).toLocaleString('ru-RU')} ★</div>
      <div class="wallet-sub">Ваш серверный баланс</div>
      <button type="button" class="btn1" onclick="openGiftShop('regular',null)">Открыть каталог подарков</button>
    </div>
    <div class="op-tabs">
      <button type="button" class="op-tab ${filter==='all'?'active':''}" onclick="openStarsSubscreen('all')">Все операции</button>
      <button type="button" class="op-tab ${filter==='in'?'active':''}" onclick="openStarsSubscreen('in')">Зачисления</button>
      <button type="button" class="op-tab ${filter==='out'?'active':''}" onclick="openStarsSubscreen('out')">Списания</button>
    </div>
    ${hist.length ? hist.map(h => `<div class="op-row"><div class="op-ico">${starMiniSvg.replace('<svg','<svg style="width:18px;height:18px;fill:#fbbf24;stroke:#fbbf24"')}</div><div class="set-txt"><div class="set-t" style="font-size:14px">${esc(h.title)}</div><div class="set-s">${fmtTime(h.at)}</div></div><div class="${String(h.amount).startsWith('+') ? 'op-amt-pos' : 'op-amt-neg'} tabular">${esc(h.amount)}</div></div>`).join('') : '<div class="empty">Операций пока нет</div>'}
  `);
}

function openCcoinsSubscreen() {
  openSubscreen('Баланс C-Coins', `
    <div class="wallet-hero">
      <div class="wallet-glow"><svg viewBox="0 0 120 120" style="width:94px;height:94px;filter:drop-shadow(0 0 22px rgba(56,189,248,.4))"><defs><linearGradient id="ccB" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e0f2fe"/><stop offset=".5" stop-color="#38bdf8"/><stop offset="1" stop-color="#0284c7"/></linearGradient></defs><path d="M24 38h72l-36 66Z" fill="url(#ccB)" stroke="#e0f2fe" stroke-width="3" stroke-linejoin="round"/></svg></div>
      <h2>Баланс C-Coins</h2><p>Внутренний баланс C-Coins, синхронизированный с сервером CW-Gram.</p>
    </div>
    <div class="wallet-card">
      <div class="wallet-amt tabular">${(currentUser.ton || 0).toLocaleString('ru-RU')}</div>
      <div class="wallet-sub">Ваш баланс C-Coins</div>
      <button type="button" class="btn1" onclick="openGiftShop('nft',null)">Открыть NFT-каталог</button>
    </div>
  `);
}

function openGiftShop(tab = 'regular', chatId = null) {
  const cp = chatId ? `'${esc(chatId)}'` : 'null';
  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3>${chatId ? 'Отправить подарок' : 'Магазин и Маркет'}</h3>
      <span class="cyan-val tabular">★ ${(currentUser.stars || 0).toLocaleString('ru-RU')}</span>
    </div>
    <div class="seg">
      <button type="button" class="seg-b ${tab==='regular'?'active':''}" onclick="openGiftShop('regular',${cp})">Обычные</button>
      <button type="button" class="seg-b ${tab==='nft'?'active':''}" onclick="openGiftShop('nft',${cp})">NFT</button>
      <button type="button" class="seg-b ${tab==='market'?'active':''}" onclick="openGiftShop('market',${cp})">Маркет</button>
    </div>
    <div class="g-grid" style="padding:0;max-height:54dvh;overflow-y:auto">
      ${tab === 'regular' ? catalog.regular.map(g => `<button type="button" class="g-card" onclick="buyShopGift('regular','${esc(g.id)}',${cp})"><div class="g-img-box">${giftImgHtml(g, 56)}</div><div class="g-name-sm">${esc(g.name)}</div><div class="g-price-pill">${starMiniSvg}${g.stars}</div></button>`).join('') :
        tab === 'nft' ? catalog.nft.map(g => `<button type="button" class="g-card" style="background:linear-gradient(155deg,${g.bg[0]},${g.bg[1]})" onclick="buyShopGift('nft','${esc(g.slug)}',${cp})"><div class="g-pat"></div><span class="g-ribbon">${esc(fmtCurrencyLabel(g.floor))}</span><div class="g-img-box">${giftImgHtml({ isNft:true, ...g }, 56)}</div><div class="g-price-pill">${starMiniSvg}${g.stars}</div></button>`).join('') :
        (catalog.market.length ? catalog.market.map(g => `<button type="button" class="g-card" style="background:linear-gradient(155deg,${g.bg[0]},${g.bg[1]})" onclick="buyMarketLot('${esc(g.uid)}')"><div class="g-pat"></div><span class="g-ribbon sale">лот</span><div class="g-img-box">${giftImgHtml(g, 56)}</div><div class="g-price-pill">${starMiniSvg}${g.salePrice}</div></button>`).join('') : '<div class="empty" style="grid-column:span 3">На маркете пока нет лотов</div>')}
    </div>
  `);
}
async function buyShopGift(kind, idOrSlug, targetChatId) { try { await api('POST', '/api/gifts/buy', { kind, idOrSlug, targetChatId }); closeModal(); await refreshAllData(); showToast(targetChatId ? 'Подарок отправлен' : 'Подарок куплен'); } catch (e) { showToast(e.message); } }
async function buyMarketLot(uid) { try { await api('POST', `/api/gifts/${uid}/buy-market`); closeModal(); await refreshAllData(); showToast('Лот куплен'); } catch (e) { showToast(e.message); } }

function viewMyGift(uid) {
  const g = myGifts.find(x => x.uid === uid); if (!g) return;
  openModal(`
    <div style="border-radius:16px;padding:18px;background:linear-gradient(155deg,${g.bg[0]},${g.bg[1]});text-align:center;margin-bottom:14px">
      <div style="display:flex;justify-content:center;margin-bottom:8px">${giftImgHtml(g, 88)}</div>
      <div style="font-size:19px;font-weight:700;color:#fff">${esc(g.name)} ${g.isNft ? '#' + g.num : ''}</div>
      ${g.isNft ? `<div style="font-size:12px;color:rgba(255,255,255,.82);margin-top:4px">Модель: ${esc(g.model)} • Узор: ${esc(fmtCurrencyLabel(g.pattern))} • ${esc(g.rarity)}</div>` : ''}
    </div>
    ${g.isNft ? `<button type="button" class="btn1" style="margin-bottom:8px" onclick="pinMyGift('${esc(uid)}')">${g.pinned ? 'Открепить от профиля' : 'Закрепить вокруг аватара'}</button>` : ''}
    <button type="button" class="btn2" style="margin-bottom:8px" onclick="saleMyGiftPrompt('${esc(uid)}',${g.forSale})">${g.forSale ? 'Снять с продажи' : 'Выставить на маркет'}</button>
    <button type="button" class="btn2" onclick="sendMyGiftPrompt('${esc(uid)}')">Подарить в чат</button>
  `);
}
async function pinMyGift(uid) { try { await api('POST', `/api/gifts/${uid}/pin`); closeModal(); await refreshAllData(); showToast('Обновлено'); } catch (e) { showToast(e.message); } }
function saleMyGiftPrompt(uid, onSale) {
  if (onSale) { api('POST', `/api/gifts/${uid}/sale`, {}).then(() => { closeModal(); return refreshAllData(); }).then(() => showToast('Снято с продажи')).catch(e => showToast(e.message)); return; }
  openModal(`<h3 style="margin-bottom:10px">Цена продажи (★)</h3><div class="fg"><input id="sl-p" class="tf" type="number" min="1" value="500"></div><button type="button" class="btn1" onclick="doSale('${esc(uid)}')">Выставить</button>`);
}
async function doSale(uid) { try { await api('POST', `/api/gifts/${uid}/sale`, { price: $('sl-p').value }); closeModal(); await refreshAllData(); showToast('Выставлено на маркет'); } catch (e) { showToast(e.message); } }
function sendMyGiftPrompt(uid) { openModal(`<h3 style="margin-bottom:10px">Выберите чат</h3>` + chats.map(c => `<button type="button" class="c-row" onclick="doSendGift('${esc(uid)}','${esc(c.id)}')"><span>${esc(c.title)}</span></button>`).join('')); }
async function doSendGift(uid, chatId) { try { await api('POST', `/api/gifts/${uid}/send`, { chatId }); closeModal(); await refreshAllData(); openChat(chatId); showToast('Отправлено'); } catch (e) { showToast(e.message); } }

// ==================== СИГНАЛЬНЫЕ ЗВОНКИ ====================
function startVoiceCallFromRoom() {
  const c = chats.find(x => x.id === activeChatId); if (!c || !c.peer) return showToast('Доступно только в личном чате');
  if (!ws || ws.readyState !== WebSocket.OPEN) return showToast('WebSocket не подключён');
  if (callPeerId) return showToast('Вызов уже активен');
  callPeerId = c.peer.id; $('call-name').textContent = c.title; $('call-ava').style.background = c.color || '#45c4cc'; $('call-ava').textContent = (c.title?.[0] || 'C').toUpperCase();
  $('call-status').textContent = 'Отправка сигнала...'; $('call-overlay').classList.remove('hidden');
  ws.send(JSON.stringify({ event: 'call:signal', payload: { toId: callPeerId, signal: 'offer', fromName: `${currentUser.firstName} ${currentUser.lastName}`.trim() } }));
}
function onWsCall(payload) {
  if (!payload || !payload.fromId) return;
  if (payload.signal === 'offer') {
    if (callPeerId) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'call:signal', payload: { toId: payload.fromId, signal: 'busy' } })); return; }
    const name = payload.fromName || 'Пользователь';
    openModal(`<h3 style="margin-bottom:8px">Входящий сигнальный вызов</h3><p class="muted" style="font-size:13px;margin-bottom:14px">${esc(name)} (без WebRTC-аудио)</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button" class="btn2" style="color:var(--red)" id="dec-c">Отклонить</button><button type="button" class="btn1" style="margin:0" id="acc-c">Принять</button></div>`);
    $('dec-c').onclick = () => { closeModal(); if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'call:signal', payload: { toId: payload.fromId, signal: 'end' } })); };
    $('acc-c').onclick = () => { closeModal(); acceptCall(payload.fromId, name); };
  } else if (payload.signal === 'accept' && callPeerId === payload.fromId) startCallCounter();
  else if (payload.signal === 'busy' && callPeerId === payload.fromId) { endCall(true); showToast('Абонент занят'); }
  else if (payload.signal === 'end') { closeModal(); if (callPeerId === payload.fromId) { endCall(true); showToast('Вызов завершён'); } }
}
function acceptCall(peerId, name) {
  callPeerId = peerId; $('call-name').textContent = name; $('call-ava').textContent = (name?.[0] || 'C').toUpperCase();
  $('call-status').textContent = 'Сигнал принят • 00:00'; $('call-overlay').classList.remove('hidden');
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'call:signal', payload: { toId: peerId, signal: 'accept' } }));
  startCallCounter();
}
function startCallCounter() { let s = 0; clearInterval(callTimer); callTimer = setInterval(() => { s++; $('call-status').textContent = `Сигнал • ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }, 1000); }
function endCall(remote = false) {
  clearInterval(callTimer); $('call-overlay').classList.add('hidden');
  if (!remote && callPeerId) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'call:signal', payload: { toId: callPeerId, signal: 'end' } }));
    api('POST', '/api/calls', { toId: callPeerId, peerName: $('call-name').textContent, duration: $('call-status').textContent }).catch(() => {});
  }
  callPeerId = null;
}
async function openCallsHistoryModal() { try { const r = await api('GET', '/api/calls'); openModal(`<h3 style="margin-bottom:12px">История звонков</h3>` + (r.calls.length ? r.calls.map(c => `<div class="set-row"><div class="set-txt"><div class="set-t">${esc(c.peerName)}</div><div class="set-s">${esc(c.duration)} • ${fmtTime(c.createdAt)}</div></div></div>`).join('') : '<p class="muted">Вызовов пока нет</p>')); } catch (e) { showToast(e.message); } }

// ==================== АДМИН-ПАНЕЛЬ ====================
async function openAdminSubscreen() {
  try {
    const data = await api('GET', '/api/admin/overview');
    openSubscreen('Панель управления', `
      <div class="card-blk" style="margin-top:8px"><div class="sec-hdr">Статистика сервера</div><div class="info-item"><div class="info-v">Пользователей: ${data.users.length} · Чатов: ${data.totalChats} · Подарков: ${data.totalGifts}</div></div></div>
      <div class="fg" style="margin:0 14px 12px"><select id="au" class="tf">${data.users.map(u=>`<option value="${esc(u.id)}">${esc(u.firstName)} ${esc(u.lastName)} (${esc(u.phone)})</option>`).join('')}</select><input id="as" class="tf" type="number" step="any" value="5000" placeholder="Количество ★ / C-Coins"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 14px 12px">
        <button type="button" class="btn1" style="margin:0" onclick="admGrant('stars')">Выдать ★</button>
        <button type="button" class="btn2" onclick="admGrant('ton')">Выдать C-Coins</button>
        <button type="button" class="btn2" onclick="admGrant('verified')">Галочка ✔</button>
        <button type="button" class="btn2" onclick="admGrant('premium')">Премиум</button>
        <button type="button" class="btn2" style="grid-column:span 2;color:var(--red)" onclick="admGrant('ban')">Бан / Разбан</button>
      </div>
      <div class="card-blk">
        <div class="sec-hdr">Выдача подарков</div>
        <div class="fg" style="margin:6px 0 10px"><select id="an" class="tf">${catalog.nft.map(g=>`<option value="${esc(g.slug)}">${esc(g.name)}</option>`).join('')}</select><input id="anum" class="tf" type="number" min="1" value="1" placeholder="Номер #"></div>
        <button type="button" class="btn1" style="margin-bottom:8px" onclick="admGift('nft')">Выдать NFT</button>
        <div class="fg" style="margin:8px 0"><select id="ar" class="tf">${catalog.regular.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></div>
        <button type="button" class="btn2" style="margin-bottom:10px" onclick="admGift('regular')">Выдать обычный подарок</button>
      </div>
      <div class="card-blk">
        <div class="sec-hdr">Рассылка во все чаты</div>
        <div class="fg" style="margin:6px 0 10px"><input id="acast" class="tf" placeholder="Текст рассылки..."></div>
        <button type="button" class="btn2" style="margin-bottom:10px" onclick="admBroadcast()">Отправить рассылку</button>
      </div>
      <div class="card-blk"><div class="sec-hdr">Аудит</div>${data.audit.slice(0,8).map(a=>`<div class="info-item"><div class="info-v" style="font-size:13.5px">${esc(a.details)}</div><div class="info-l">${esc(a.action)} • ${fmtTime(a.createdAt)}</div></div>`).join('')}</div>
    `);
  } catch (e) { showToast(e.message); }
}
async function admGrant(action) { try { await api('POST', '/api/admin/grant', { targetUserId: $('au').value, action, amount: $('as').value }); await refreshAllData(); openAdminSubscreen(); showToast('Выполнено'); } catch (e) { showToast(e.message); } }
async function admGift(kind) { try { await api('POST', '/api/admin/grant', { targetUserId: $('au').value, action: 'gift', giftKind: kind, giftKey: kind === 'nft' ? $('an').value : $('ar').value, giftNum: $('anum').value }); await refreshAllData(); openAdminSubscreen(); showToast('Подарок выдан'); } catch (e) { showToast(e.message); } }
async function admBroadcast() { try { await api('POST', '/api/admin/broadcast', { text: $('acast').value }); await refreshAllData(); openAdminSubscreen(); showToast('Рассылка отправлена'); } catch (e) { showToast(e.message); } }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('m-bg').classList.contains('hidden')) closeModal();
    else if (!$('story-viewer').classList.contains('hidden')) closeStoryViewer();
    else if (!$('peer-profile-screen').classList.contains('hidden')) closePeerProfile();
    else if (!$('global-search-screen').classList.contains('hidden')) closeGlobalSearch();
    else if (!$('chat-room').classList.contains('hidden')) closeChat();
    else if (!$('sub-screen').classList.contains('hidden')) closeSubscreen();
  }
});

if (token) bootApp().catch(err => { $('chats-skeleton')?.classList.add('hidden'); if (token) showToast(err?.message || 'Ошибка подключения'); });