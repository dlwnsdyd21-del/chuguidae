// 스토어 등록용 스크린샷(홍보 문구 + 앱 화면 + 엑셀 결과)을 만든다.
// 먼저 `npm run serve` 로 www 를 띄워 둘 것. 실행: node scripts/store-screenshots.js
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const URL = process.env.APP_URL || 'http://localhost:8765/';
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(fs.existsSync);
if (!CHROME) throw new Error('크롬 또는 엣지가 필요합니다');

// out: 최종 이미지 크기(px), app: 앱 화면을 찍을 뷰포트(css px)와 배율
// 구글 플레이: 긴 쪽이 짧은 쪽의 2배 이하여야 한다
const SIZES = {
  'play-phone-1080x1920': { out: [1080, 1920], app: { width: 360, height: 640, dsf: 3 } },
  'play-tablet10-1600x2560': { out: [1600, 2560], app: { width: 800, height: 1180, dsf: 2 } },
  'ios-iphone6.7-1290x2796': { out: [1290, 2796], app: { width: 430, height: 850, dsf: 3 } },
  'ios-ipad12.9-2048x2732': { out: [2048, 2732], app: { width: 1024, height: 1240, dsf: 2 } },
};

const SHOTS = [
  { id: '01-input', title: '봉투 받으면 이름·금액만 톡톡', sub: '접수 번호가 자동으로 붙어요' },
  { id: '02-amount', title: '금액은 한글로 한 번 더 확인', sub: '100,000원 (십만원) · 자릿수 실수 없이' },
  { id: '03-excel', title: '끝나면 엑셀로 바로 정리', sub: '필터 · 합계 수식까지 들어간 파일',
    points: ['머리글마다 필터 — 누구 손님별로 바로 보기', '합계·건수는 수식이라 필터에 맞춰 자동 계산', '취소한 접수는 합계에서 자동 제외', '카카오톡·메일로 바로 공유'] },
  { id: '04-excel-sum', title: '누구 손님별 합계도 자동', sub: '혼주님께 그대로 전달하세요',
    points: ['신랑·신부 / 아버지·어머니별 건수·금액·식권', '시트 3장: 접수 내역 · 구분별 합계 · 변경 이력', '수정·취소한 기록도 시각과 함께 남아요'] },
  { id: '05-list', title: '접수 목록 검색·필터', sub: '수정·취소 내역은 이력에 남아요' },
  { id: '06-more', title: '인터넷 없이, 이 기기에만 저장', sub: '예식장 통신이 불안해도 걱정 없어요' },
];

const E = (min, name, man, host, memo = '', tickets = 1, unknown = false) => ({ min, name, unknown, amount: man * 10000, host, memo, tickets });
const ENTRIES = [
  E(0, '박지훈', 10, '신랑', '대학 동기', 2), E(1, '최수아', 5, '신랑 어머니', '', 1), E(3, '정우진', 5, '신랑 아버지', '직장 동료', 1),
  E(4, '강하은', 3, '', '', 1), E(6, '', 5, '', '봉투에 "○○산악회"', 1, true), E(8, '윤도현', 10, '신랑', '', 2),
  E(9, '임채원', 5, '신랑 어머니', '교회', 1), E(11, '한지민', 20, '신랑 아버지', '거래처', 2), E(12, '오준서', 5, '', '', 0),
  E(14, '서예린', 5, '신랑', '고등학교 친구', 1), E(15, '신태양', 7, '기타', '', 1), E(17, '배소율', 10, '신랑 어머니', '', 2),
  E(18, '조민재', 30, '신랑 아버지', '', 2), E(20, '홍길순', 5, '신랑 어머니', '이웃', 1),
];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colName = (c) => String.fromCharCode(65 + c);

// 엑셀 창처럼 보이는 HTML (실제 내보낸 파일의 셀 값·수식으로 그린다)
function excelHtml(file, sheetNames, active, sheet, sel) {
  const { cells, rows, cols, merges, widths, headerRow } = sheet;
  const mergeAt = {};
  const covered = new Set();
  for (const m of merges) {
    const end = Math.min(m.e.c, cols - 1); // 화면에 보이는 열까지만 병합
    mergeAt[m.s.r + ',' + m.s.c] = end - m.s.c + 1;
    for (let c = m.s.c + 1; c <= end; c++) covered.add(m.s.r + ',' + c);
  }
  let body = '';
  for (let r = 0; r < rows; r++) {
    body += `<tr><th class="rn">${r + 1}</th>`;
    for (let c = 0; c < cols; c++) {
      const k = r + ',' + c;
      if (covered.has(k)) continue;
      const cell = cells[k];
      const span = mergeAt[k] ? ` colspan="${mergeAt[k]}"` : '';
      const cls = [
        cell && cell.t === 'n' ? 'num' : '',
        r === headerRow ? 'hd' : '',
        sheet.titleRow && r === 0 ? 'title' : '',
        sel && sel.r === r && sel.c === c ? 'sel' : '',
        cell && cell.bold ? 'b' : '',
      ].join(' ');
      const filt = r === headerRow ? '<span class="fb">▾</span>' : '';
      body += `<td class="${cls}"${span}>${esc(cell ? cell.w : '')}${filt}</td>`;
    }
    body += '</tr>';
  }
  const colgroup = '<col style="width:34px">' + widths.map((w) => `<col style="width:${w}px">`).join('');
  const head = '<tr><th></th>' + widths.map((_, c) => `<th class="${sel && sel.c === c ? 'on' : ''}">${colName(c)}</th>`).join('') + '</tr>';
  const selCell = sel ? cells[sel.r + ',' + sel.c] : null;
  const fx = selCell ? (selCell.f ? '=' + selCell.f : selCell.w) : '';
  const tabs = sheetNames.map((n) => `<span class="tab${n === active ? ' on' : ''}">${esc(n)}</span>`).join('');
  return `<!doctype html><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: "Malgun Gothic", sans-serif; background: #fff; width: ${34 + widths.reduce((a, b) => a + b, 0)}px; }
    .bar { background: #107c41; color: #fff; font-size: 14px; padding: 9px 12px; display: flex; gap: 10px; align-items: center; }
    .bar b { background: #fff; color: #107c41; border-radius: 3px; padding: 0 5px; font-size: 13px; }
    .fx { display: flex; border-bottom: 1px solid #d4d4d4; font-size: 13px; }
    .fx .nm { width: 80px; padding: 6px 8px; border-right: 1px solid #d4d4d4; color: #333; }
    .fx .fi { padding: 6px 10px; color: #333; font-family: Consolas, "Malgun Gothic", monospace; }
    .fx .fi i { color: #777; font-style: normal; margin-right: 10px; }
    table { border-collapse: collapse; table-layout: fixed; font-size: 14px; }
    th { background: #f3f3f3; color: #555; font-weight: 400; border: 1px solid #d4d4d4; height: 26px; font-size: 12px; }
    th.on { background: #d3e7dc; color: #107c41; border-bottom: 2px solid #107c41; }
    td { border: 1px solid #e1e1e1; height: 28px; padding: 0 6px; white-space: nowrap; overflow: hidden; color: #222; position: relative; }
    td.num { text-align: right; }
    td.title { font-weight: 700; font-size: 15px; }
    td.b { font-weight: 700; }
    td.hd { background: #f2e8df; font-weight: 700; padding-right: 22px; }
    td.hd .fb { position: absolute; right: 3px; top: 5px; width: 16px; height: 16px; border: 1px solid #aaa; background: #fff; font-size: 10px; line-height: 14px; text-align: center; color: #555; border-radius: 2px; }
    td.sel { outline: 2px solid #107c41; outline-offset: -2px; }
    .tabs { display: flex; gap: 2px; border-top: 1px solid #d4d4d4; background: #f3f3f3; padding-left: 34px; font-size: 13px; }
    .tab { padding: 7px 14px; color: #555; }
    .tab.on { background: #fff; color: #107c41; font-weight: 700; border-bottom: 3px solid #107c41; }
  </style>
  <div id="xl"><div class="bar"><b>X</b>${esc(file)}</div>
  <div class="fx"><span class="nm">${sel ? colName(sel.c) + (sel.r + 1) : ''}</span><span class="fi"><i>fx</i>${esc(fx)}</span></div>
  <table>${colgroup}${head}${body}</table><div class="tabs">${tabs}</div></div>`;
}

// 홍보 문구 + 화면 이미지를 최종 크기로 합성
function composeHtml(W, H, title, sub, imgB64, isExcel, points) {
  const top = Math.round(H * 0.19);
  const pad = Math.round(W * 0.07);
  const t = Math.round(W * 0.064);
  const s = Math.round(W * 0.036);
  const radius = Math.round(W * 0.035);
  return `<!doctype html><meta charset="utf-8"><style>
    * { margin: 0; box-sizing: border-box; }
    body { width:${W}px; height:${H}px; background: linear-gradient(170deg, #8a5a44 0%, #6f4534 100%); font-family: "Malgun Gothic", sans-serif; overflow: hidden; position: relative; }
    .cap { position:absolute; top:0; left:0; right:0; height:${top}px; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; color:#fffaf3; padding: 0 ${pad}px; }
    .cap h1 { font-size:${t}px; font-weight:800; letter-spacing:-0.02em; }
    .cap p { font-size:${s}px; margin-top:${Math.round(s * 0.6)}px; color:#f3e0cf; }
    .img { position:absolute; top:${top}px; left:0; right:0; bottom:0; display:flex; flex-direction:column; align-items:center; }
    ul { list-style:none; padding:0; margin-top:${Math.round(pad * 0.9)}px; width:${W - pad * 2}px; }
    li { color:#fffaf3; font-size:${Math.round(s * 1.02)}px; padding:${Math.round(s * 0.55)}px 0 ${Math.round(s * 0.55)}px ${Math.round(s * 1.7)}px; position:relative; border-bottom:1px solid rgba(255,250,243,.18); }
    li::before { content:'✓'; position:absolute; left:0; color:#ffd9a8; font-weight:800; }
    img { ${isExcel ? `width:${W - pad * 2}px; height:auto;` : ''} max-width:${W - pad * 2}px; max-height:${H - top - (isExcel ? pad * 2 : Math.round(pad * 0.6))}px; border-radius:${isExcel ? Math.round(radius / 3) : radius}px; box-shadow: 0 ${Math.round(W * 0.02)}px ${Math.round(W * 0.06)}px rgba(0,0,0,.35); }
  </style><div class="cap"><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
  <div class="img"><img src="data:image/png;base64,${imgB64}">${points ? '<ul>' + points.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''}</div>`;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--lang=ko-KR', '--force-device-scale-factor=1'] });
  const OUT = 'store/screenshots';
  fs.rmSync(OUT, { recursive: true, force: true });

  for (const [name, s] of Object.entries(SIZES)) {
    const ctx = await browser.createBrowserContext(); // 크기마다 새 저장소
    const page = await ctx.newPage();
    const mobile = s.app.width < 700;
    await page.setViewport({ width: s.app.width, height: s.app.height, deviceScaleFactor: s.app.dsf, isMobile: mobile, hasTouch: mobile });
    await page.goto(URL, { waitUntil: 'networkidle0' });

    // 예시 예식과 접수 내역 넣기 (접수 시각은 예식 당일 11:20부터)
    const eventId = await page.evaluate(async (entries) => {
      const ev = await DB.saveEvent({ side: '신랑측', groom: '김민준', bride: '이서연', date: '2026-11-07', venue: '더 그랜드 웨딩홀', clerk: '박영수', hosts: ['신랑', '신랑 아버지', '신랑 어머니', '기타'] });
      const base = new Date('2026-11-07T11:20:00+09:00').getTime();
      for (const e of entries) {
        const { min, ...data } = e;
        const saved = await DB.addEntry(ev.id, data);
        saved.time = new Date(base + min * 60000 + 17000).toISOString();
        await new Promise((res, rej) => {
          const req = indexedDB.open('chuguidae');
          req.onsuccess = () => {
            const t = req.result.transaction('entries', 'readwrite');
            t.objectStore('entries').put(saved);
            t.oncomplete = () => { req.result.close(); res(); };
            t.onerror = rej;
          };
        });
      }
      return ev.id;
    }, ENTRIES);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.evaluate(() => { $('#offline-status').hidden = true; $('#btn-install').hidden = true; $('#env-warn').hidden = true; });

    const raw = {};
    const grab = async (id) => { raw[id] = await page.screenshot({ encoding: 'base64' }); };

    await page.evaluate(async (id) => { await openEvent(id); showLast(state.entries[state.entries.length - 1]); }, eventId);
    await grab('01-input');
    await page.evaluate(() => {
      $('#last-saved').hidden = true;
      $('#en-name').value = '김하늘'; $('#en-name').dispatchEvent(new Event('input'));
      $('#en-amount').value = '10'; $('#en-amount').dispatchEvent(new Event('input'));
      document.querySelector('#en-hosts .chip').click();
      if (document.activeElement) document.activeElement.blur();
    });
    await grab('02-amount');
    await page.evaluate(() => { resetEntryForm(); switchTab('list'); });
    await grab('05-list');
    await page.evaluate(() => switchTab('more'));
    await grab('06-more');

    // 실제 엑셀 파일을 만들어 셀 값·수식을 읽는다
    const xl = await page.evaluate(async () => {
      const { blob, filename } = await makeExcel();
      const wb = XLSX.read(await blob.arrayBuffer(), { cellFormula: true, cellNF: true });
      const read = (ws, colsN) => {
        const ref = XLSX.utils.decode_range(ws['!ref']);
        const cells = {};
        for (let r = ref.s.r; r <= ref.e.r; r++) for (let c = 0; c < colsN; c++) {
          const a = ws[XLSX.utils.encode_cell({ r, c })];
          if (!a) continue;
          const w = a.t === 'n' ? (a.z === '#,##0' ? Math.round(a.v).toLocaleString('ko-KR') : String(a.v)) : String(a.v ?? '');
          cells[r + ',' + c] = { t: a.t, w, f: a.f || null };
        }
        return { cells, rows: ref.e.r + 1, merges: ws['!merges'] || [] };
      };
      return {
        filename: filename.replace(/_\d{6}\.xlsx$/, '.xlsx'),
        names: wb.SheetNames,
        s1: read(wb.Sheets[wb.SheetNames[0]], 9),
        s2: read(wb.Sheets[wb.SheetNames[1]], 4),
      };
    });
    await ctx.close();

    // 엑셀 화면 그리기
    const xpage = await browser.newPage();
    // 세로로 긴 휴대폰 화면에서는 엑셀 창을 앞쪽 열(번호~메모)까지만 보이게 해서 글씨를 키운다
    const narrow = s.out[0] / s.out[1] < 0.6;
    const allW = [46, 150, 78, 98, 104, 150, 46, 52, 98];
    const s1 = { ...xl.s1, cols: narrow ? 6 : 9, widths: narrow ? allW.slice(0, 6) : allW, headerRow: 4, titleRow: true };
    for (const k of ['2,0', '2,3', '2,4', '2,5', '2,6', '2,7']) if (s1.cells[k]) s1.cells[k].bold = true;
    const s2 = { ...xl.s2, cols: 4, widths: [150, 80, 130, 80], headerRow: 0 };
    for (let c = 0; c < 4; c++) if (s2.cells[(s2.rows - 1) + ',' + c]) s2.cells[(s2.rows - 1) + ',' + c].bold = true;
    const xlShots = [
      ['03-excel', excelHtml(xl.filename, xl.names, xl.names[0], s1, { r: 2, c: 3 })],
      ['04-excel-sum', excelHtml(xl.filename, xl.names, xl.names[1], s2, { r: 2, c: 2 })],
    ];
    for (const [id, html] of xlShots) {
      await xpage.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
      await xpage.setContent(html, { waitUntil: 'load' });
      raw[id] = await (await xpage.$('#xl')).screenshot({ encoding: 'base64' });
    }

    // 합성
    const dir = path.join(OUT, name);
    fs.mkdirSync(dir, { recursive: true });
    const [W, H] = s.out;
    await xpage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    for (const shot of SHOTS) {
      await xpage.setContent(composeHtml(W, H, shot.title, shot.sub, raw[shot.id], shot.id.includes('excel'), shot.points), { waitUntil: 'load' });
      await xpage.screenshot({ path: path.join(dir, shot.id + '.png'), clip: { x: 0, y: 0, width: W, height: H } });
    }
    await xpage.close();
    console.log('done', name);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
