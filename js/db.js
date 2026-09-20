// IndexedDB 저장소. 모든 데이터는 이 기기 안에만 저장된다.
const DB = (() => {
  const NAME = 'chuguidae';
  const VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    const mine = dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
        const en = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        en.createIndex('eventId', 'eventId');
        const lg = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
        lg.createIndex('eventId', 'eventId');
      };
      req.onsuccess = () => {
        const db = req.result;
        // 연결이 끊기면(휴대폰에서 앱이 오래 뒤에 있었을 때 등) 다음 동작에서 다시 연결한다
        const drop = () => { if (dbp === mine) dbp = null; try { db.close(); } catch (_) {} };
        db.onclose = drop;
        db.onversionchange = drop;
        resolve(db);
      };
      req.onerror = () => { if (dbp === mine) dbp = null; reject(req.error); };
    });
    return dbp;
  }

  const p = (req) => new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

  // 여러 스토어를 한 트랜잭션으로 묶어 실행. fn 안에서는 p(store.xxx())만 await 할 것.
  async function tx(stores, mode, fn, retried) {
    const db = await open();
    let t;
    try {
      t = db.transaction(stores, mode);
    } catch (e) {
      // 끊긴 연결이면 한 번만 다시 연결해서 시도 (아직 아무것도 기록되지 않았으므로 안전)
      if (retried || e.name !== 'InvalidStateError') throw e;
      dbp = null;
      try { db.close(); } catch (_) {}
      return tx(stores, mode, fn, true);
    }
    return new Promise((resolve, reject) => {
      let result;
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => {
        if (t.error && t.error.name === 'UnknownError') dbp = null;
        reject(t.error || new Error('저장이 중단되었습니다'));
      };
      Promise.resolve(fn(...stores.map((s) => t.objectStore(s))))
        .then((r) => { result = r; })
        .catch((e) => { try { t.abort(); } catch (_) {} reject(e); });
    });
  }

  const now = () => new Date().toISOString();

  return {
    listEvents: () => tx(['events'], 'readonly', (ev) => p(ev.getAll())),
    getEvent: (id) => tx(['events'], 'readonly', (ev) => p(ev.get(id))),

    async saveEvent(event) {
      return tx(['events'], 'readwrite', async (ev) => {
        if (!event.id) {
          delete event.id;
          event.nextNo = 1;
          event.createdAt = now();
          event.closedAt = null;
        }
        event.id = await p(ev.put(event));
        return event;
      });
    },

    listEntries: (eventId) =>
      tx(['entries'], 'readonly', (en) => p(en.index('eventId').getAll(eventId))),
    listLogs: (eventId) =>
      tx(['logs'], 'readonly', (lg) => p(lg.index('eventId').getAll(eventId))),

    // 접수 번호 발급과 기록 저장을 한 트랜잭션으로 처리 (번호 중복·누락 방지)
    addEntry(eventId, data) {
      return tx(['events', 'entries', 'logs'], 'readwrite', async (ev, en, lg) => {
        const event = await p(ev.get(eventId));
        if (event.closedAt) throw new Error('마감된 행사입니다');
        const entry = { ...data, eventId, no: event.nextNo, time: now(), status: '정상' };
        event.nextNo += 1;
        await p(ev.put(event));
        entry.id = await p(en.add(entry));
        await p(lg.add({ eventId, time: entry.time, no: entry.no, type: '접수', detail: describe(entry) }));
        return entry;
      });
    },

    updateEntry(entryId, changes, type) {
      return tx(['events', 'entries', 'logs'], 'readwrite', async (ev, en, lg) => {
        const entry = await p(en.get(entryId));
        const event = await p(ev.get(entry.eventId));
        if (event.closedAt) throw new Error('마감된 행사입니다');
        const diffs = [];
        for (const k of Object.keys(changes)) {
          if ((entry[k] ?? '') !== (changes[k] ?? '')) {
            diffs.push(`${LABELS[k] || k}: ${fmt(k, entry[k])} → ${fmt(k, changes[k])}`);
            entry[k] = changes[k];
          }
        }
        if (!diffs.length) return entry;
        await p(en.put(entry));
        await p(lg.add({ eventId: entry.eventId, time: now(), no: entry.no, type: type || '수정', detail: diffs.join(' / ') }));
        return entry;
      });
    },

    setClosed(eventId, closed) {
      return tx(['events', 'logs'], 'readwrite', async (ev, lg) => {
        const event = await p(ev.get(eventId));
        event.closedAt = closed ? now() : null;
        await p(ev.put(event));
        await p(lg.add({ eventId, time: now(), no: '', type: closed ? '접수 마감' : '접수 다시 열기', detail: '' }));
        return event;
      });
    },

    async exportBackup(eventId) {
      const [event, entries, logs] = await Promise.all([this.getEvent(eventId), this.listEntries(eventId), this.listLogs(eventId)]);
      return { app: 'chuguidae', version: 1, exportedAt: now(), event, entries, logs };
    },

    // 백업은 항상 새 행사로 추가된다 (기존 데이터를 덮어쓰지 않음)
    importBackup(data) {
      if (!data || data.app !== 'chuguidae' || !data.event) throw new Error('이 앱의 백업 파일이 아닙니다');
      return tx(['events', 'entries', 'logs'], 'readwrite', async (ev, en, lg) => {
        const event = { ...data.event };
        delete event.id;
        const id = await p(ev.add(event));
        for (const e of data.entries || []) { const c = { ...e, eventId: id }; delete c.id; await p(en.add(c)); }
        for (const l of data.logs || []) { const c = { ...l, eventId: id }; delete c.id; await p(lg.add(c)); }
        await p(lg.add({ eventId: id, time: now(), no: '', type: '백업 불러오기', detail: `백업 시각 ${data.exportedAt || ''}` }));
        return id;
      });
    },
  };

  function fmt(k, v) {
    if (v === undefined || v === null || v === '') return '(없음)';
    if (k === 'amount') return Number(v).toLocaleString('ko-KR') + '원';
    if (k === 'unknown') return v ? '예' : '아니오';
    return String(v);
  }
  function describe(e) {
    return `${e.unknown ? '이름 미확인' : e.name} / ${fmt('amount', e.amount)}` + (e.host ? ` / ${e.host}` : '');
  }
})();

const LABELS = { name: '이름', amount: '금액', host: '누구 손님', memo: '메모', tickets: '식권', unknown: '이름 미확인', status: '상태' };
