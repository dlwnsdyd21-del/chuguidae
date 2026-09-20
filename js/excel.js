// 엑셀(.xlsx) 내보내기 — SheetJS 사용. 합계는 값이 아니라 수식으로 넣는다.
const Excel = (() => {
  const S1 = '접수 내역';
  const HEAD_ROW = 5;          // 머리글 행 (1부터)
  const FIRST = HEAD_ROW + 1;  // 첫 데이터 행
  const NOHOST = '(미지정)';

  const z = (x) => String(x).padStart(2, '0');
  const dt = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; };
  const num = (v, f) => ({ t: 'n', v, z: '#,##0', ...(f ? { f } : {}) });

  function baseName(event) {
    const who = event.side === '신랑측' ? event.groom : event.bride;
    return `축의금_${event.side}_${who}_${event.date}`.replace(/[\\/:*?"<>|]/g, '');
  }

  // 여러 번 저장해도 파일 이름이 겹치지 않게 저장 시각(시분초)을 붙인다
  function stamp() { const d = new Date(); return `_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; }

  function build(event, entries, logs) {
    const rows = [...entries].sort((a, b) => a.no - b.no);
    const last = Math.max(FIRST, FIRST + rows.length - 1);
    const active = rows.filter((e) => e.status !== '취소');
    const sum = (arr, k) => arr.reduce((s, e) => s + (Number(e[k]) || 0), 0);

    // ----- 시트 1: 접수 내역 -----
    const aoa = [
      [`${event.groom} ♥ ${event.bride} 축의금 접수 내역 (${event.side})`],
      [`예식일 ${event.date}${event.venue ? ' · ' + event.venue : ''}${event.clerk ? ' · 접수 ' + event.clerk : ''}${event.closedAt ? ' · 마감 ' + dt(event.closedAt) : ''}`],
      ['합계 금액', null, null, num(sum(active, 'amount'), `SUBTOTAL(109,D${FIRST}:D${last})`), '건수', num(active.length, `SUBTOTAL(102,D${FIRST}:D${last})`), '식권', num(sum(active, 'tickets'), `SUBTOTAL(109,G${FIRST}:G${last})`)],
      ['※ 필터를 걸면 합계·건수가 보이는 행 기준으로 바뀝니다. 취소된 접수는 합계에서 제외됩니다.'],
      ['번호', '접수 시각', '이름', '금액', '누구 손님', '메모', '식권', '상태', '취소 전 금액'],
    ];
    for (const e of rows) {
      const canceled = e.status === '취소';
      aoa.push([
        e.no, dt(e.time), e.unknown ? `미확인-${e.no}` : e.name,
        canceled ? null : num(e.amount),
        e.host || NOHOST, e.memo || '',
        canceled || !e.tickets ? null : e.tickets,
        e.status, canceled ? num(e.amount) : null,
      ]);
    }
    const ws1 = XLSX.utils.aoa_to_sheet(aoa);
    ws1['!autofilter'] = { ref: `A${HEAD_ROW}:I${last}` };
    ws1['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 6 }, { wch: 8 }, { wch: 14 }];
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }, { s: { r: 3, c: 0 }, e: { r: 3, c: 8 } }];

    // ----- 시트 2: 구분별 합계 -----
    const hosts = [...new Set([...event.hosts, ...rows.map((e) => e.host).filter(Boolean)])];
    if (rows.some((e) => !e.host)) hosts.push(NOHOST);
    const ref = (col) => `'${S1}'!$${col}$${FIRST}:$${col}$${last}`;
    const aoa2 = [['누구 손님', '건수', '금액', '식권']];
    hosts.forEach((h, i) => {
      const r = i + 2;
      const mine = active.filter((e) => (e.host || NOHOST) === h);
      aoa2.push([
        h,
        num(mine.length, `COUNTIFS(${ref('E')},A${r},${ref('H')},"정상")`),
        num(sum(mine, 'amount'), `SUMIFS(${ref('D')},${ref('E')},A${r},${ref('H')},"정상")`),
        num(sum(mine, 'tickets'), `SUMIFS(${ref('G')},${ref('E')},A${r},${ref('H')},"정상")`),
      ]);
    });
    const end = hosts.length + 1;
    aoa2.push(['합계',
      num(active.length, `SUM(B2:B${end})`), num(sum(active, 'amount'), `SUM(C2:C${end})`), num(sum(active, 'tickets'), `SUM(D2:D${end})`)]);
    const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
    ws2['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 8 }];

    // ----- 시트 3: 변경 이력 -----
    const aoa3 = [['시각', '접수 번호', '구분', '내용']];
    for (const l of logs) aoa3.push([dt(l.time), l.no === '' ? null : l.no, l.type, l.detail || '']);
    const ws3 = XLSX.utils.aoa_to_sheet(aoa3);
    ws3['!autofilter'] = { ref: `A1:D${Math.max(2, aoa3.length)}` };
    ws3['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, S1);
    XLSX.utils.book_append_sheet(wb, ws2, '구분별 합계');
    XLSX.utils.book_append_sheet(wb, ws3, '변경 이력');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return {
      blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      filename: baseName(event) + stamp() + '.xlsx',
    };
  }

  return { build, baseName, stamp };
})();
