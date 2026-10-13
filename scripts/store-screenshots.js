// 스토어 등록용 스크린샷을 만든다. 먼저 `npm run serve` 로 www 를 띄워 둘 것.
// 실행: node scripts/store-screenshots.js  → store/screenshots/<크기>/*.png
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const URL = process.env.APP_URL || 'http://localhost:8765/';
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(fs.existsSync);
if (!CHROME) throw new Error('크롬 또는 엣지가 필요합니다');

const SIZES = {
  'play-phone-1080x2340': { width: 360, height: 780, dsf: 3 },
  'play-tablet10-1600x2560': { width: 800, height: 1280, dsf: 2 },
  'ios-iphone6.7-1290x2796': { width: 430, height: 932, dsf: 3 },
  'ios-ipad12.9-2048x2732': { width: 1024, height: 1366, dsf: 2 },
};

const E = (name, man, host, memo = '', tickets = 1, unknown = false) => ({ name, unknown, amount: man * 10000, host, memo, tickets });
const ENTRIES = [
  E('박지훈', 10, '신랑', '대학 동기', 2), E('최수아', 5, '신랑 어머니', '', 1), E('정우진', 5, '신랑 아버지', '직장 동료', 1),
  E('강하은', 3, '', '', 1), E('', 5, '', '봉투에 "○○산악회"', 1, true), E('윤도현', 10, '신랑', '', 2),
  E('임채원', 5, '신랑 어머니', '교회', 1), E('한지민', 20, '신랑 아버지', '', 2), E('오준서', 5, '', '', 0),
  E('서예린', 5, '신랑', '고등학교 친구', 1), E('신태양', 7, '기타', '', 1), E('배소율', 10, '신랑 어머니', '', 2),
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--lang=ko-KR', '--force-device-scale-factor=1'] });
  for (const [name, s] of Object.entries(SIZES)) {
    const ctx = await browser.createBrowserContext(); // 크기마다 새 저장소
    const page = await ctx.newPage();
    const mobile = s.width < 700;
    await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: s.dsf, isMobile: mobile, hasTouch: mobile });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    const eventId = await page.evaluate(async (entries) => {
      const ev = await DB.saveEvent({ side: '신랑측', groom: '김민준', bride: '이서연', date: '2026-11-07', venue: '더 그랜드 웨딩홀', clerk: '', hosts: ['신랑', '신랑 아버지', '신랑 어머니', '기타'] });
      for (const e of entries) await DB.addEntry(ev.id, e);
      return ev.id;
    }, ENTRIES);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.evaluate(() => { $('#offline-status').hidden = true; $('#btn-install').hidden = true; $('#env-warn').hidden = true; });

    const dir = path.join('store/screenshots', name);
    fs.mkdirSync(dir, { recursive: true });
    const shot = (n) => page.screenshot({ path: path.join(dir, n + '.png') });

    await shot('05-home');
    await page.evaluate(async (id) => { await openEvent(id); showLast(state.entries[state.entries.length - 1]); }, eventId);
    await shot('01-input');
    await page.evaluate(() => {
      $('#last-saved').hidden = true;
      $('#en-name').value = '박지훈'; $('#en-name').dispatchEvent(new Event('input'));
      $('#en-amount').value = '10'; $('#en-amount').dispatchEvent(new Event('input'));
      document.querySelector('#en-hosts .chip').click();
    });
    await shot('02-amount');
    await page.evaluate(() => { resetEntryForm(); switchTab('list'); });
    await shot('03-list');
    await page.evaluate(() => switchTab('more'));
    await shot('04-more');
    await ctx.close();
    console.log('done', name);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
