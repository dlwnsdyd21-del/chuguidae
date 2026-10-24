const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = (n) => Number(n).toLocaleString('ko-KR') + '원';
const onlyDigits = (s) => String(s).replace(/[^0-9]/g, '');

const QUICK = [3, 5, 7, 10, 20, 30, 50, 100];
const DEFAULT_HOSTS = { 신랑측: ['신랑', '신랑 아버지', '신랑 어머니', '기타'], 신부측: ['신부', '신부 아버지', '신부 어머니', '기타'] };

const state = { event: null, entries: [], editingEventId: null, setupHosts: [], host: '', unit: 'man', filter: '전체', editEntry: null };

// ---------- 공통 ----------
function koreanAmount(n) {
  n = Math.floor(Number(n));
  if (!n || n < 0) return '';
  const d = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const su = ['', '십', '백', '천'];
  const bu = ['', '만', '억', '조'];
  let out = '';
  for (let i = 0; n > 0; i++, n = Math.floor(n / 10000)) {
    const chunk = n % 10000;
    if (!chunk) continue;
    let s = '';
    String(chunk).split('').reverse().forEach((ch, j) => {
      const k = Number(ch);
      if (k) s = (k === 1 && j > 0 ? '' : d[k]) + su[j] + s;
    });
    if (chunk === 1 && i === 1) s = '';
    out = s + bu[i] + out;
  }
  return out + '원';
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  // 수정 창(dialog)이 열려 있으면 그 안에 넣어야 창 위로 보인다
  ($('dialog[open]') || document.body).appendChild(t);
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, msg.length > 22 ? 5000 : 2600);
}

// 기기 저장소 오류가 조용히 묻히지 않도록 한다
let fatalShown = false;
window.addEventListener('unhandledrejection', (e) => {
  if (fatalShown) return;
  fatalShown = true;
  setTimeout(() => { fatalShown = false; }, 3000);
  const msg = (e.reason && e.reason.message) || String(e.reason);
  alert('방금 동작을 처리하지 못했습니다.\n(' + msg + ')\n\n한 번 더 눌러 보시고, 계속되면 앱을 완전히 닫았다가 다시 열어 주세요.\n접수 번호가 화면에 나왔던 내용은 이미 저장되어 있습니다.');
});

// <dialog> 를 지원하지 않는 아주 오래된 브라우저(iOS 15.3 이하)에서는 안내만 한다
function openDialog(d) {
  if (typeof d.showModal !== 'function') { alert('이 기능은 iOS 15.4 이상에서 쓸 수 있습니다. 설정 > 일반 > 소프트웨어 업데이트를 해 주세요.'); return false; }
  d.showModal();
  return true;
}

function show(screen) {
  $$('.screen').forEach((s) => { s.hidden = s.id !== 'screen-' + screen; });
  window.scrollTo(0, 0);
}

// 안드로이드 '뒤로 가기'가 앱을 닫지 않고 한 단계만 돌아가도록 화면 이동을 기록에 남긴다.
// 기록 추가는 반드시 click 핸들러 안에서 할 것 (아니면 크롬이 그 기록을 건너뛴다).
function pushNav(st) { try { history.pushState(st, ''); } catch (_) {} }
function replaceNav(st) { try { history.replaceState(st, ''); } catch (_) {} }
window.addEventListener('popstate', async (e) => {
  $$('dialog[open]').forEach((d) => d.close());
  const st = e.state;
  if (!st || st.s !== 'main') { renderHome(); return; }
  const same = !$('#screen-main').hidden && state.event && state.event.id === st.id;
  if (!same) await openEvent(st.id); // 같은 예식에서 탭만 바뀔 땐 입력 중인 내용을 지우지 않는다
  switchTab(st.tab || 'input');
});

function timeStr(iso) {
  const d = new Date(iso);
  const z = (x) => String(x).padStart(2, '0');
  return `${z(d.getHours())}:${z(d.getMinutes())}`;
}
function dateTimeStr(iso) {
  const d = new Date(iso);
  const z = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}
const displayName = (e) => (e.unknown ? `미확인-${e.no}` : e.name);

// ---------- 행사 목록 ----------
async function renderHome() {
  const events = (await DB.listEvents()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('#event-list').innerHTML = events.length
    ? events.map((ev) => `
      <div class="card" data-id="${ev.id}">
        <h3>${esc(ev.groom)} ♥ ${esc(ev.bride)} <span class="tag">${esc(ev.side)}</span>${ev.closedAt ? '<span class="tag">마감</span>' : ''}</h3>
        <p>${esc(ev.date)}${ev.venue ? ' · ' + esc(ev.venue) : ''} · 접수 ${ev.nextNo - 1}건</p>
      </div>`).join('')
    : '<p class="empty">아직 만든 예식이 없습니다.<br>아래 버튼으로 시작하세요.</p>';
  show('home');
}

$('#event-list').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const id = Number(card.dataset.id);
  pushNav({ s: 'main', id });
  openEvent(id);
});

$('#btn-new-event').addEventListener('click', () => { pushNav({ s: 'setup' }); openSetup(null); });

$('#file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    await DB.importBackup(JSON.parse(await file.text()));
    toast('백업을 불러왔습니다');
    renderHome();
  } catch (err) {
    alert('불러오지 못했습니다: ' + err.message);
  }
});

// ---------- 설정 ----------
function openSetup(event) {
  state.editingEventId = event ? event.id : null;
  $('#setup-title').textContent = event ? '예식 정보 수정' : '새 예식';
  const side = event ? event.side : '신랑측';
  setSeg('#seg-side', side);
  $('#su-groom').value = event?.groom || '';
  $('#su-bride').value = event?.bride || '';
  $('#su-date').value = event?.date || '';
  $('#su-venue').value = event?.venue || '';
  $('#su-clerk').value = event?.clerk || '';
  state.setupHosts = event ? [...event.hosts] : [...DEFAULT_HOSTS[side]];
  renderSetupHosts();
  show('setup');
}

function setSeg(sel, v) { $$(sel + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); }
const getSeg = (sel) => $(sel + ' button.on').dataset.v;

$('#seg-side').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const before = getSeg('#seg-side');
  setSeg('#seg-side', b.dataset.v);
  // 기본 선택지를 손대지 않았다면 신랑측/신부측에 맞춰 바꿔 준다
  if (JSON.stringify(state.setupHosts) === JSON.stringify(DEFAULT_HOSTS[before])) {
    state.setupHosts = [...DEFAULT_HOSTS[b.dataset.v]];
    renderSetupHosts();
  }
});

function renderSetupHosts() {
  $('#su-hosts').innerHTML = state.setupHosts
    .map((h, i) => `<button type="button" class="chip" data-i="${i}">${esc(h)}<span class="x">✕</span></button>`).join('');
}
$('#su-hosts').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  state.setupHosts.splice(Number(c.dataset.i), 1);
  renderSetupHosts();
});
function addSetupHost() {
  const v = $('#su-host-new').value.trim();
  if (v && !state.setupHosts.includes(v)) state.setupHosts.push(v);
  $('#su-host-new').value = '';
  renderSetupHosts();
}
$('#su-host-add').addEventListener('click', addSetupHost);
$('#su-host-new').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault(); // Enter로 설정 전체가 저장되어 버리지 않게
  if (!e.isComposing) addSetupHost(); // 한글 조합 중의 Enter는 무시
});

$('#form-setup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const base = state.editingEventId ? await DB.getEvent(state.editingEventId) : {};
  const event = await DB.saveEvent({
    ...base,
    side: getSeg('#seg-side'),
    groom: $('#su-groom').value.trim(),
    bride: $('#su-bride').value.trim(),
    date: $('#su-date').value,
    venue: $('#su-venue').value.trim(),
    clerk: $('#su-clerk').value.trim(),
    hosts: [...state.setupHosts],
  });
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if (state.editingEventId && history.state?.s === 'setup') { history.back(); return; } // popstate가 예식 화면을 새로 그린다
  if (history.state?.s === 'setup') replaceNav({ s: 'main', id: event.id });
  openEvent(event.id);
});

// ---------- 메인 ----------
async function openEvent(id) {
  state.event = await DB.getEvent(id);
  state.entries = await DB.listEntries(id);
  state.host = '';
  state.filter = '전체';
  $('#main-title').textContent = `${state.event.groom} ♥ ${state.event.bride}`;
  $('#main-sub').textContent = `${state.event.side} · ${state.event.date}`;
  $('#last-saved').hidden = true;
  renderEntryHosts();
  resetEntryForm();
  refreshMain();
  switchTab('input');
  show('main');
  focusName();
}

function refreshMain() {
  const closed = !!state.event.closedAt;
  const active = state.entries.filter((e) => e.status !== '취소').length;
  $('#main-count').textContent = `접수 ${active}건`;
  $('#closed-banner').hidden = !closed;
  $$('#form-entry input, #form-entry button').forEach((el) => { el.disabled = closed; });
  $('#en-name').disabled = closed || $('#en-unknown').checked;
  $('#btn-close').textContent = closed ? '접수 다시 열기' : '접수 마감';
  $('#btn-edit-event').disabled = closed;
  if (!$('#tab-list').hidden) renderList();
}

function switchTab(name) {
  $$('.tab').forEach((t) => { t.hidden = t.id !== 'tab-' + name; });
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  if (name === 'list') renderList();
  window.scrollTo(0, 0);
}
$('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const tab = b.dataset.tab;
  const cur = history.state;
  if (cur && cur.s === 'main') {
    if (tab === 'input') { if (cur.tab) { history.back(); return; } } // popstate가 접수 탭으로 돌린다
    else if (cur.tab) replaceNav({ ...cur, tab });
    else pushNav({ ...cur, tab });
  }
  switchTab(tab);
});

$$('[data-back]').forEach((b) => b.addEventListener('click', () => {
  const cur = history.state;
  if (cur) { history.go(cur.s === 'main' && cur.tab ? -2 : -1); return; }
  if (!$('#screen-setup').hidden && state.editingEventId) openEvent(state.editingEventId);
  else renderHome();
}));

// ---------- 접수 입력 ----------
const focusName = () => { if (!state.event.closedAt && matchMedia('(min-width: 700px)').matches) $('#en-name').focus(); };

$('#quick').innerHTML = QUICK.map((q) => `<button type="button" data-q="${q}">${q}만</button>`).join('');
$('#quick').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  setUnit('man');
  $('#en-amount').value = b.dataset.q;
  updateAmountRead();
});

function setUnit(u) {
  if (state.unit === u) return;
  const cur = currentAmount();
  state.unit = u;
  setSeg('#seg-unit', u);
  $('#en-unit-label').textContent = u === 'man' ? '만원' : '원';
  // 단위를 바꿔도 실제 금액은 유지
  if (cur) $('#en-amount').value = u === 'man' ? (cur % 10000 === 0 ? cur / 10000 : '') : cur.toLocaleString('ko-KR');
  updateAmountRead();
}
$('#seg-unit').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { setUnit(b.dataset.v); $('#en-amount').focus(); } });

function currentAmount() {
  const n = Number(onlyDigits($('#en-amount').value) || 0);
  return state.unit === 'man' ? n * 10000 : n;
}
function updateAmountRead() {
  const a = currentAmount();
  $('#amount-read').innerHTML = a ? `${won(a)} (${koreanAmount(a)})` : '&nbsp;';
}
$('#en-amount').addEventListener('input', () => {
  const digits = onlyDigits($('#en-amount').value).replace(/^0+/, '');
  $('#en-amount').value = state.unit === 'won' && digits ? Number(digits).toLocaleString('ko-KR') : digits;
  updateAmountRead();
});

function renderEntryHosts() {
  $('#en-hosts').innerHTML = state.event.hosts
    .map((h) => `<button type="button" class="chip${state.host === h ? ' on' : ''}" data-h="${esc(h)}">${esc(h)}</button>`).join('');
}
$('#en-hosts').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  state.host = state.host === c.dataset.h ? '' : c.dataset.h;
  renderEntryHosts();
});

function applyUnknown() {
  const u = $('#en-unknown').checked;
  $('#en-name').disabled = u || !!state.event.closedAt;
  if (u) $('#en-name').value = '';
  $('#en-name').placeholder = u ? '이름 없이 접수합니다' : '봉투에 적힌 이름';
  $('#memo-label').innerHTML = u ? '알아볼 단서 <em>봉투 글씨, 소속, 인상착의 등</em>' : '메모 <em>선택</em>';
  $('#en-memo').placeholder = u ? '예: 봉투에 "○○산악회", 50대 남성' : '소속, 관계 등';
  $('#dup-hint').hidden = true;
}
$('#en-unknown').addEventListener('change', () => { applyUnknown(); ($('#en-unknown').checked ? $('#en-amount') : $('#en-name')).focus(); });

$('#en-name').addEventListener('input', () => {
  const name = $('#en-name').value.trim();
  const same = name ? state.entries.filter((e) => e.status !== '취소' && !e.unknown && e.name === name) : [];
  $('#dup-hint').hidden = !same.length;
  if (same.length) $('#dup-hint').textContent = `같은 이름이 이미 있습니다 (${same.map((e) => e.no + '번').join(', ')}). 동명이인이면 메모에 구분을 적어 주세요.`;
});

// Enter: 이름 → 금액 → 메모 → 저장
const enterNext = { 'en-name': 'en-amount', 'en-amount': 'en-memo' };
$('#form-entry').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const next = enterNext[e.target.id];
  if (next) { e.preventDefault(); $('#' + next).focus(); }
});

function resetEntryForm() {
  $('#form-entry').reset();
  state.host = '';
  state.unit = 'man';
  setSeg('#seg-unit', 'man');
  $('#en-unit-label').textContent = '만원';
  renderEntryHosts();
  applyUnknown();
  updateAmountRead();
}

let saving = false;
$('#form-entry').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (saving) return;
  const unknown = $('#en-unknown').checked;
  const name = $('#en-name').value.trim();
  const amount = currentAmount();
  if (!unknown && !name) { toast('이름을 입력해 주세요'); $('#en-name').focus(); return; }
  if (!amount) { toast('금액을 입력해 주세요'); $('#en-amount').focus(); return; }
  if ((amount >= 1000000 || amount < 10000) && !confirm(`${won(amount)} (${koreanAmount(amount)})\n금액이 맞나요?`)) { $('#en-amount').focus(); return; }

  saving = true;
  try {
    const entry = await DB.addEntry(state.event.id, {
      name: unknown ? '' : name, unknown, amount, host: state.host,
      memo: $('#en-memo').value.trim(), tickets: Number(onlyDigits($('#en-tickets').value) || 0),
    });
    state.entries.push(entry);
    state.event.nextNo = entry.no + 1;
    showLast(entry);
    resetEntryForm();
    refreshMain();
    window.scrollTo(0, 0);
    focusName();
  } catch (err) {
    alert('저장하지 못했습니다: ' + err.message);
  } finally {
    saving = false;
  }
});

function showLast(entry) {
  const el = $('#last-saved');
  el.hidden = false;
  el.innerHTML = `
    <div class="no"><small>접수 번호</small>${entry.no}</div>
    <div class="info"><b>${esc(displayName(entry))}</b> · ${won(entry.amount)}<br>
      ${entry.host ? esc(entry.host) + ' · ' : ''}봉투에 번호 ${entry.no}을(를) 적어 주세요</div>
    <button type="button" class="btn" data-edit="${entry.id}">수정</button>`;
}
$('#last-saved').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) openEdit(Number(b.dataset.edit)); });

// ---------- 목록 ----------
function renderList() {
  const hosts = [...new Set([...state.event.hosts, ...state.entries.map((e) => e.host).filter(Boolean)])];
  const filters = ['전체', ...hosts, '손님 미지정', '이름 미확인', '취소'];
  if (!filters.includes(state.filter)) state.filter = '전체';
  $('#ls-filters').innerHTML = filters.map((f) => `<button type="button" class="chip${state.filter === f ? ' on' : ''}" data-f="${esc(f)}">${esc(f)}</button>`).join('');

  const q = $('#ls-search').value.trim().toLowerCase();
  const items = state.entries.filter((e) => {
    const f = state.filter;
    if (f === '취소') { if (e.status !== '취소') return false; }
    else if (f === '이름 미확인') { if (!e.unknown) return false; }
    else if (f === '손님 미지정') { if (e.host) return false; }
    else if (f !== '전체' && e.host !== f) return false;
    if (!q) return true;
    return [displayName(e), e.memo, String(e.no), e.host].some((v) => String(v || '').toLowerCase().includes(q));
  }).sort((a, b) => b.no - a.no);

  $('#ls-items').innerHTML = items.length
    ? items.map((e) => `
      <div class="item${e.status === '취소' ? ' canceled' : ''}" data-id="${e.id}">
        <div class="no">${e.no}</div>
        <div class="mid"><b>${esc(displayName(e))}</b>
          <small>${timeStr(e.time)}${e.host ? ' · ' + esc(e.host) : ''}${e.tickets ? ' · 식권 ' + e.tickets : ''}${e.memo ? ' · ' + esc(e.memo) : ''}${e.status === '취소' ? ' · 취소됨' : ''}</small></div>
        <div class="amt">${won(e.amount)}</div>
      </div>`).join('')
    : '<p class="empty">해당하는 접수 내역이 없습니다.</p>';
}
$('#ls-search').addEventListener('input', renderList);
$('#ls-filters').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { state.filter = c.dataset.f; renderList(); } });
$('#ls-items').addEventListener('click', (e) => { const it = e.target.closest('.item'); if (it) openEdit(Number(it.dataset.id)); });

// ---------- 수정 ----------
function openEdit(id) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;
  state.editEntry = entry;
  const locked = !!state.event.closedAt || entry.status === '취소';
  $('#ed-title').textContent = `${entry.no}번 접수 · ${dateTimeStr(entry.time)}${entry.status === '취소' ? ' · 취소됨' : ''}`;
  $('#ed-unknown').checked = !!entry.unknown;
  $('#ed-name').value = entry.name || '';
  $('#ed-amount').value = Number(entry.amount).toLocaleString('ko-KR');
  const hosts = [...new Set([...state.event.hosts, entry.host].filter(Boolean))];
  $('#ed-host').innerHTML = '<option value="">(선택 안 함)</option>' + hosts.map((h) => `<option${h === entry.host ? ' selected' : ''}>${esc(h)}</option>`).join('');
  $('#ed-memo').value = entry.memo || '';
  $('#ed-tickets').value = entry.tickets || '';
  $$('#form-edit input, #form-edit select, #form-edit button[type=submit]').forEach((el) => { el.disabled = locked; });
  $('#ed-name').disabled = locked || entry.unknown;
  $('#ed-cancel-entry').textContent = entry.status === '취소' ? '취소 되돌리기' : '접수 취소';
  $('#ed-cancel-entry').disabled = !!state.event.closedAt;
  updateEditRead();
  openDialog($('#dlg-edit'));
}
function updateEditRead() {
  const a = Number(onlyDigits($('#ed-amount').value) || 0);
  $('#ed-amount-read').innerHTML = a ? `${won(a)} (${koreanAmount(a)})` : '&nbsp;';
}
$('#ed-amount').addEventListener('input', () => {
  const d = onlyDigits($('#ed-amount').value).replace(/^0+/, '');
  $('#ed-amount').value = d ? Number(d).toLocaleString('ko-KR') : '';
  updateEditRead();
});
$('#ed-unknown').addEventListener('change', () => {
  $('#ed-name').disabled = $('#ed-unknown').checked;
  if ($('#ed-unknown').checked) $('#ed-name').value = '';
});
$('#ed-close').addEventListener('click', () => $('#dlg-edit').close());

async function applyEdit(changes, type) {
  try {
    const updated = await DB.updateEntry(state.editEntry.id, changes, type);
    state.entries[state.entries.findIndex((e) => e.id === updated.id)] = updated;
    $('#dlg-edit').close();
    if (!$('#last-saved').hidden && $('#last-saved [data-edit]')?.dataset.edit == updated.id) {
      if (updated.status === '취소') $('#last-saved').hidden = true; else showLast(updated);
    }
    refreshMain();
    return true;
  } catch (err) {
    alert('저장하지 못했습니다: ' + err.message);
    return false;
  }
}

$('#form-edit').addEventListener('submit', async (e) => {
  e.preventDefault();
  const unknown = $('#ed-unknown').checked;
  const name = $('#ed-name').value.trim();
  const amount = Number(onlyDigits($('#ed-amount').value) || 0);
  if (!unknown && !name) { toast('이름을 입력해 주세요'); return; }
  if (!amount) { toast('금액을 입력해 주세요'); return; }
  if (await applyEdit({ unknown, name: unknown ? '' : name, amount, host: $('#ed-host').value, memo: $('#ed-memo').value.trim(), tickets: Number(onlyDigits($('#ed-tickets').value) || 0) })) toast('수정했습니다');
});

$('#ed-cancel-entry').addEventListener('click', async () => {
  const en = state.editEntry;
  if (en.status === '취소') {
    if (await applyEdit({ status: '정상' }, '취소 되돌리기')) toast(`${en.no}번 접수를 되돌렸습니다`);
  } else if (confirm(`${en.no}번 접수(${displayName(en)}, ${won(en.amount)})를 취소할까요?\n번호와 내용은 기록에 남습니다.`)) {
    if (await applyEdit({ status: '취소' }, '취소')) toast(`${en.no}번 접수를 취소했습니다`);
  }
});

// ---------- 더보기 ----------
async function makeExcel() {
  // 변경 이력을 못 읽어도 화면에 있는 접수 내역만으로 엑셀은 만들 수 있게 한다
  const logs = await DB.listLogs(state.event.id).catch(() => null);
  if (!logs) toast('변경 이력을 읽지 못해 접수 내역만 저장합니다');
  return Excel.build(state.event, state.entries, logs || []);
}

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
function canShareFile(f) { try { return !!navigator.canShare && navigator.canShare({ files: [f] }); } catch (_) { return false; } }
function download(blob, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
// 아이폰·아이패드의 홈 화면 앱은 내려받기가 잘 안 되므로 공유 창(파일에 저장, 카카오톡 등)으로 내보낸다
async function saveOut(blob, filename) { // 안내 문구를 돌려준다
  if (window.Native && Native.isNative) {
    const r = await Native.saveFile(blob, filename);
    if (r.busy) return '이미 내보내는 중입니다';
    return (r.shared ? '내보냈습니다' : '공유를 취소했습니다') + (r.savedWhere ? `. ${r.savedWhere}에도 저장되어 있습니다` : '');
  }
  const file = new File([blob], filename, { type: blob.type });
  if (isIOS && canShareFile(file)) {
    try { await navigator.share({ files: [file] }); return SAVE_MSG.shared; }
    catch (err) { if (err.name === 'AbortError') return SAVE_MSG.canceled; }
  }
  download(blob, filename);
  return SAVE_MSG.downloaded;
}
const SAVE_MSG = {
  shared: "내보냈습니다. '파일에 저장'을 골랐다면 파일 앱에 있습니다",
  canceled: '취소했습니다. 파일은 아직 저장되지 않았습니다',
  downloaded: isIOS ? "미리보기가 열리면 공유 버튼 → '파일에 저장'을 눌러 주세요" : '파일을 내려받았습니다 (다운로드 폴더 확인)',
};

$('#btn-excel').addEventListener('click', async () => {
  try {
    const { blob, filename } = await makeExcel();
    toast(await saveOut(blob, filename));
  } catch (err) { alert('엑셀 저장에 실패했습니다: ' + err.message); }
});

$('#btn-backup').addEventListener('click', async () => {
  try {
    const data = await DB.exportBackup(state.event.id);
    const name = Excel.baseName(state.event).replace('축의금', '축의대백업') + Excel.stamp() + '.json';
    toast(await saveOut(new Blob([JSON.stringify(data)], { type: 'application/json' }), name));
  } catch (err) { alert('백업 저장에 실패했습니다: ' + err.message); }
});

$('#btn-close').addEventListener('click', async () => {
  const closing = !state.event.closedAt;
  const msg = closing ? '접수를 마감할까요?\n마감하면 입력과 수정이 잠깁니다.' : '접수를 다시 열까요?';
  if (!confirm(msg)) return;
  state.event = await DB.setClosed(state.event.id, closing);
  refreshMain();
  applyUnknown();
  toast(closing ? '접수를 마감했습니다. 엑셀로 저장해 주세요.' : '접수를 다시 열었습니다');
});

$('#btn-edit-event').addEventListener('click', () => { pushNav({ s: 'setup' }); openSetup(state.event); });

$('#btn-logs').addEventListener('click', async () => {
  const logs = (await DB.listLogs(state.event.id)).reverse();
  $('#logs-body').innerHTML = logs.length
    ? logs.map((l) => `<div><time>${dateTimeStr(l.time)}</time><b>${l.no ? l.no + '번 ' : ''}${esc(l.type)}</b><br>${esc(l.detail)}</div>`).join('')
    : '<p class="empty">기록이 없습니다.</p>';
  openDialog($('#dlg-logs'));
});
$('#logs-close').addEventListener('click', () => $('#dlg-logs').close());

// ---------- 시작 ----------
const setStatus = (msg, cls) => { const el = $('#offline-status'); el.textContent = msg; el.className = 'status' + (cls ? ' ' + cls : ''); el.hidden = false; };
const setWarn = (title, msg) => { const w = $('#env-warn'); w.innerHTML = '<b>' + esc(title) + '</b>' + esc(msg); w.hidden = false; };

// 웹 버전에 처음 들어온 사람에게 설치·사용 안내를 권한다 (한 번만)
const WELCOME_KEY = 'chuguidae.welcomeSeen';
const welcomeSeen = () => { try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch (_) { return true; } }; // 저장이 막힌 브라우저에서는 매번 뜨지 않게
const markWelcomeSeen = () => { try { localStorage.setItem(WELCOME_KEY, '1'); } catch (_) {} };
let welcomeCheck = null;
async function maybeWelcome({ standalone, inApp }) {
  if (standalone || welcomeSeen()) return; // 홈 화면 아이콘으로 연 경우는 이미 설치한 사람
  if (/guide\.html/.test(document.referrer)) { markWelcomeSeen(); return; } // 안내를 보고 들어온 경우
  if ($('#screen-home').hidden) return;
  try { if ((await DB.listEvents()).length) { markWelcomeSeen(); return; } } catch (_) { return; } // 이미 쓰던 사람
  const d = $('#dlg-welcome');
  if (typeof d.showModal !== 'function') return;
  const tip = $('#welcome-tip');
  const android = /Android/i.test(navigator.userAgent);
  tip.textContent = inApp
    ? '지금은 카카오톡·네이버 같은 앱 안에서 열렸어요. 안내를 보고 사파리(아이폰)나 크롬(안드로이드)으로 열어 주세요.'
    : isIOS ? '아이폰·아이패드는 사파리에서 "홈 화면에 추가"를 해야 앱처럼, 인터넷 없이 쓸 수 있어요.'
    : android ? '홈 화면에 설치하면 앱처럼 쓸 수 있어요. 플레이스토어 앱으로 받는 방법도 안내에 있어요.'
    : '설치 없이 바로 쓸 수 있어요. 휴대폰에서 쓰는 방법은 안내를 확인해 주세요.';
  tip.hidden = false;
  d.addEventListener('close', markWelcomeSeen, { once: true });
  d.showModal();
}
// 안내로 넘어가기 전에 창을 닫아 둔다 (뒤로 가기로 돌아왔을 때 창이 다시 떠 있지 않게)
$('#welcome-guide').addEventListener('click', () => { markWelcomeSeen(); $('#dlg-welcome').close(); });
$('#welcome-start').addEventListener('click', () => $('#dlg-welcome').close());

const nativeApp = !!(window.Native && Native.isNative);
if (nativeApp) {
  // 설치된 앱: 서비스워커·설치 안내가 필요 없다. 버전만 표시
  Native.getInfo().then((i) => { $('#app-version').textContent = `앱 버전 ${i.version} (${i.build})`; }).catch(() => {});
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
} else if (location.protocol.startsWith('http')) {
  $('#beta-note').hidden = false; // 웹 버전에서만 테스트 안내
  const ua = navigator.userAgent;
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const inApp = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua);

  welcomeCheck = () => maybeWelcome({ standalone, inApp });

  if (!('serviceWorker' in navigator) || inApp) {
    setWarn('다른 앱 안에서 열렸습니다', '카카오톡·네이버 같은 앱 안의 화면에서는 설치가 되지 않습니다. 메뉴에서 "다른 브라우저로 열기"를 눌러 사파리(아이폰)나 크롬(안드로이드)에서 열어 주세요.');
  } else if (isIOS && !standalone) {
    setWarn('홈 화면에 추가해 주세요', '아래쪽 공유 버튼(네모에 화살표) → "홈 화면에 추가"를 누른 뒤, 홈 화면에 생긴 아이콘으로 열어서 사용하세요. 지금 이 사파리 화면에서 입력한 내용은 홈 화면 앱에서는 보이지 않습니다.');
  }

  // 안드로이드 크롬·PC: 설치 버튼
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#btn-install').hidden = false; });
  window.addEventListener('appinstalled', () => { $('#btn-install').hidden = true; toast('설치했습니다. 홈 화면의 아이콘으로 열어 주세요'); });
  $('#btn-install').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice.catch(() => {});
    installEvt = null;
    $('#btn-install').hidden = true;
  });

  if ('serviceWorker' in navigator) {
    setStatus('인터넷 없이 쓸 준비를 하는 중… 인터넷에 연결된 채로 잠시 기다려 주세요');
    const fail = () => setStatus('아직 인터넷 없이 쓸 준비가 안 됐습니다. 인터넷에 연결하고 앱을 다시 열어 주세요.', 'bad');
    const timer = setTimeout(fail, 40000);
    navigator.serviceWorker.register('sw.js').catch(() => { clearTimeout(timer); fail(); });
    navigator.serviceWorker.ready
      .then(() => Promise.all([caches.match('js/vendor/xlsx.full.min.js', { ignoreSearch: true }), caches.keys()]))
      .then(([hit, keys]) => {
        clearTimeout(timer);
        const ver = keys.filter((k) => k.startsWith('chuguidae-')).sort().pop();
        $('#app-version').textContent = ver ? '앱 버전 ' + ver.replace('chuguidae-', '') : '';
        if (hit) setStatus('✓ 인터넷 없이 사용할 준비가 되었습니다' + (ver ? ' (' + ver.replace('chuguidae-', '') + ')' : ''), 'ok'); else fail();
      })
      .catch(fail);
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

// 새로고침되거나 앱이 다시 그려져도 보던 예식으로 돌아온다
(async () => {
  const st = history.state;
  try {
    if (st && st.s === 'main' && await DB.getEvent(st.id)) {
      await openEvent(st.id);
      switchTab(st.tab || 'input');
      return;
    }
    if (st) replaceNav(null);
    await renderHome();
    if (welcomeCheck) welcomeCheck();
  } catch (err) {
    show('home');
    $('#event-list').innerHTML = '<p class="empty">이 브라우저에서 기기 저장소를 열 수 없습니다.<br>앱을 완전히 닫았다가 다시 열어 주세요.<br><small>' + esc((err && err.message) || err) + '</small></p>';
  }
})();
