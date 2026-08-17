// 브라우저 없이 검증하기 위한 최소 DOM 스텁 + 실제 모듈 실행.
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// ── DOM 스텁 ────────────────────────────────────────────────
class NodeBase {
  constructor() { this.childNodes = []; }
  append(...kids) { this.childNodes.push(...kids); }
  replaceChildren(...kids) { this.childNodes = kids; }
}
class TextNode extends NodeBase {
  constructor(t) { super(); this.text = String(t); }
  serialize() { return this.text; }
}
class Element extends NodeBase {
  constructor(tag) {
    super();
    this.tagName = tag; this.attrs = {}; this.dataset = {};
    this._class = ''; this.listeners = {}; this.hidden = false;
  }
  get className() { return this._class; }
  set className(v) { this._class = v; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  set textContent(v) { this.childNodes = [new TextNode(v)]; }
  get textContent() { return this.serializeText(); }
  serializeText() {
    return this.childNodes.map(c => c instanceof TextNode ? c.text : c.serializeText()).join('');
  }
  serialize(d = 0) {
    const pad = '  '.repeat(d);
    const cls = this._class ? ` .${this._class.split(' ').join('.')}` : '';
    const at = Object.entries(this.attrs).map(([k, v]) => ` ${k}="${v}"`).join('');
    const kids = this.childNodes.map(c =>
      c instanceof TextNode ? `${pad}  ${JSON.stringify(c.text)}` : c.serialize(d + 1)).join('\n');
    return `${pad}<${this.tagName}${cls}${at}>` + (kids ? '\n' + kids : '');
  }
}
globalThis.Node = NodeBase;
globalThis.document = {
  createElement: (t) => new Element(t),
  createTextNode: (t) => new TextNode(t),
};

// ── 모듈 로드 ───────────────────────────────────────────────
const model = await import(`${ROOT}/assets/js/model.js`);
const links = await import(`${ROOT}/assets/js/maplinks.js`);
const sheets = await import(`${ROOT}/assets/js/sheets.js`);
const { renderTimeline } = await import(`${ROOT}/assets/js/timeline.js`);
const { renderBudget } = await import(`${ROOT}/assets/js/budget.js`);
const { renderDayBookings, renderBookingList } = await import(`${ROOT}/assets/js/bookings.js`);

// ── 간이 assert ─────────────────────────────────────────────
let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; }
  else { fail++; console.log(`  ✗ ${label}\n      got  ${g}\n      want ${w}`); }
};
const ok = (label, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${label} ${detail}`); }
};
const section = (t) => console.log(`\n── ${t}`);

// ── CSV 파서 ────────────────────────────────────────────────
section('CSV 파서');
eq('따옴표 안 쉼표',
  sheets.parseCsv('a,b\n1,"2, 3"\n'), [['a', 'b'], ['1', '2, 3']]);
eq('이스케이프된 따옴표',
  sheets.parseCsv('a\n"he said ""hi"""\n'), [['a'], ['he said "hi"']]);
eq('필드 안 줄바꿈',
  sheets.parseCsv('a,b\n1,"line1\nline2"\n'), [['a', 'b'], ['1', 'line1\nline2']]);
eq('CRLF', sheets.parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
eq('BOM 제거', sheets.parseCsv('﻿a,b\n1,2'), [['a', 'b'], ['1', '2']]);
eq('빈 행 제거',
  sheets.rowsToObjects([['a', 'b'], ['', ''], ['1', '2']]), [{ a: '1', b: '2' }]);

// ── 날짜/시간/좌표/금액 ─────────────────────────────────────
section('값 파서');
for (const [input, want] of [
  ['2026-09-13', '2026-09-13'],
  ['2026. 9. 13.', '2026-09-13'],
  ['2026/9/3', '2026-09-03'],
  ['9/13/2026', '2026-09-13'],
  ['Date(2026,8,13)', '2026-09-13'],
  ['', null], ['헛소리', null],
]) eq(`parseDate(${JSON.stringify(input)})`, model.parseDate(input), want);

for (const [input, want] of [
  ['09:30', '09:30'], ['9:30', '09:30'], ['9:30:00', '09:30'],
  ['오후 1:05', '13:05'], ['1:05 PM', '13:05'], ['오전 12:10', '00:10'],
  ['9시 30분', '09:30'], ['', null], ['25:00', null],
]) eq(`parseTime(${JSON.stringify(input)})`, model.parseTime(input), want);

for (const [input, want] of [
  ['35.7148, 139.7967', [35.7148, 139.7967]],
  ['35.7148,139.7967', [35.7148, 139.7967]],
  ['-33.86,151.20', [-33.86, 151.2]],
  ['https://www.google.com/maps/@35.7148,139.7967,17z', [35.7148, 139.7967]],
  ['https://maps.google.com/?q=35.7148,139.7967', [35.7148, 139.7967]],
  ['https://www.google.com/maps/place/X/@35.1,139.1,17z/data=!3d35.7148!4d139.7967', [35.7148, 139.7967]],
  ['', null], ['서울역', null], ['999, 999', null],
]) eq(`parseCoord(${JSON.stringify(input.slice(0, 42))})`, model.parseCoord(input), want);

for (const [input, want] of [
  ['1200', 1200], ['1,200', 1200], ['¥1,200', 1200], ['1200엔', 1200],
  ['0', 0], ['', null], ['-', null], ['무료', null],
]) eq(`parseMoney(${JSON.stringify(input)})`, model.parseMoney(input), want);

// ── 실제 샘플 데이터 파이프라인 ─────────────────────────────
section('샘플 데이터 파이프라인');
const rawRows = (n) => sheets.parseCsv(readFileSync(`${ROOT}/sample/${n}.csv`, 'utf8'));
const read = (n) => sheets.rowsToObjects(rawRows(n));
const settings = model.buildSettings(rawRows('settings')); // 설정은 헤더 없이 원시 행으로
const items = model.buildItinerary(read('itinerary'), settings);
const bookings = model.buildBookings(read('bookings'));
const byDate = model.groupByDate(items);

eq('설정 제목', settings.title, '도쿄 가족여행');
eq('설정 통화기호', settings.currencySymbol, '¥');
eq('설정 지도중심', settings.mapCenter, [35.6812, 139.7671]);
eq('설정 시간대', settings.timezone, 'Asia/Tokyo');
eq('일정 건수', items.length, 26);
eq('날짜 수', byDate.size, 5);
eq('날짜 순서', [...byDate.keys()],
  ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17']);
ok('모든 일정에 날짜가 있다', items.every(i => i.date));
ok('좌표가 있는 일정이 다수', items.filter(i => i.coord).length >= 15,
  `(${items.filter(i => i.coord).length}개)`);

const day1 = byDate.get('2026-09-13');
eq('1일차 첫 일정', day1[0].title, '인천공항 집결');
eq('1일차 seq 부여', day1.map(i => i.seq), [1, 2, 3, 4, 5, 6]);
ok('하루 안 시간 오름차순',
  [...byDate.values()].every(list => {
    const t = list.filter(i => i.start).map(i => i.start);
    return t.every((v, i) => i === 0 || t[i - 1] <= v);
  }));

eq('예약 건수', bookings.length, 3);
eq('숙소 체크인/아웃 걸침',
  model.bookingsForDate(bookings, '2026-09-15').map(b => b.name), ['신주쿠 워싱턴 호텔']);
eq('첫날 예약 2건(항공+숙소)',
  model.bookingsForDate(bookings, '2026-09-13').length, 2);
eq('마지막날 예약 2건',
  model.bookingsForDate(bookings, '2026-09-17').length, 2);

eq('날짜 라벨', model.formatDateLabel('2026-09-13').full, '9월 13일 (일)');
eq('금액 포맷', model.formatMoney(84000, settings), '¥84,000');
eq('여행지 오늘 계산', /^\d{4}-\d{2}-\d{2}$/.test(model.todayInTimezone('Asia/Tokyo')), true);

// ── 구글 지도 딥링크 ────────────────────────────────────────
section('구글 지도 딥링크');
eq('도보 → walking', links.travelMode('도보'), 'walking');
eq('전철 → transit', links.travelMode('전철'), 'transit');
eq('택시 → driving', links.travelMode('택시'), 'driving');
eq('자전거 → bicycling', links.travelMode('자전거'), 'bicycling');
eq('빈 값 → transit', links.travelMode(''), 'transit');

const senso = items.find(i => i.title === '센소지');
const skytree = items.find(i => i.title === '도쿄 스카이트리');
const searchU = links.searchUrl(senso);
ok('장소 열기 URL', searchU.startsWith('https://www.google.com/maps/search/?api=1&query='), searchU);
ok('장소 열기에 좌표 포함', decodeURIComponent(searchU).includes('35.7148,139.7967'), searchU);

const dirU = links.directionsUrl(senso, skytree);
const dirP = new URL(dirU).searchParams;
eq('길찾기 origin', dirP.get('origin'), '35.7148,139.7967');
eq('길찾기 destination', dirP.get('destination'), '35.7101,139.8107');
// 「이동」은 '그 일정에 도착하는 수단'이므로 도착지(스카이트리=전철) 값을 씁니다.
eq('길찾기 travelmode는 도착지 기준', dirP.get('travelmode'), 'transit');

eq('비행기는 항공 구간', links.isAirTravel('비행기'), true);
eq('진에어 표기도 항공', links.isAirTravel('진에어 비행기'), true);
eq('공항버스는 항공 아님', links.isAirTravel('공항버스(30분)'), false);
eq('빈 값은 항공 아님', links.isAirTravel(''), false);

eq('링크 여러 개 분리', model.parseLinks('https://a.com/1\n\nhttps://b.com/2').length, 2);
eq('URL 아닌 텍스트는 버림', model.parseLinks('진에어'), []);
eq('링크 라벨은 도메인', model.linkLabel('https://m.blog.naver.com/x/1'), 'm.blog.naver.com');

// 검색(관대)과 경로(엄격)의 기준이 다릅니다
const placeOnly = { place: '이치란 시부야점' };
ok('좌표 없으면 장소명으로 검색',
  decodeURIComponent(links.searchUrl(placeOnly)).includes('이치란 시부야점'));
eq('장소만 있어도 경로 지점은 됨', links.hasLocation(placeOnly), true);

const titleOnly = { title: '자유시간' };
ok('제목만 있어도 검색은 가능', links.searchUrl(titleOnly) !== null);
eq('제목만 있으면 경로 지점 아님', links.hasLocation(titleOnly), false);
eq('제목만인 두 지점 사이엔 길찾기 없음', links.directionsUrl(titleOnly, titleOnly), null);
eq('아무 정보 없으면 null', links.searchUrl({}), null);
eq('아무 정보 없으면 경로 지점 아님', links.hasLocation({}), false);

const route = links.dayRouteUrl(byDate.get('2026-09-14'));
const rp = new URL(route.url).searchParams;
eq('하루 경로 dropped=0', route.dropped, 0);
eq('하루 경로 경유지 수', rp.get('waypoints').split('|').length, 4);

// 경유지 9개 초과 케이스
const many = Array.from({ length: 15 }, (_, i) => ({ coord: [35 + i / 100, 139 + i / 100] }));
const bigRoute = links.dayRouteUrl(many);
eq('경유지 상한 9', new URL(bigRoute.url).searchParams.get('waypoints').split('|').length, 9);
eq('빠진 곳 수 보고', bigRoute.dropped, 13 - 9);
eq('2곳 미만이면 null', links.dayRouteUrl([{ coord: [1, 2] }]), null);

// ── 렌더 모듈 실제 실행 ─────────────────────────────────────
section('렌더 모듈 실행');
const box = () => new Element('div');

const tl = box();
renderTimeline(tl, byDate.get('2026-09-14'), settings);
const tlHtml = tl.serialize();
ok('타임라인 엔트리 6개', (tlHtml.match(/<article \.entry/g) || []).length === 6);
ok('구간 길찾기 링크 생성', tlHtml.includes('로 이동 · 길찾기'));
ok('구간 링크가 구글 지도로', tlHtml.includes('https://www.google.com/maps/dir/'));
ok('비용 표시', tlHtml.includes('¥3,100'));
ok('외부 링크 rel 설정', tlHtml.includes('rel="noopener noreferrer"'));

const empty = box();
renderTimeline(empty, [], settings);
ok('빈 날짜 처리', empty.serialize().includes('등록된 일정이 없습니다'));

const bud = box();
renderBudget(bud, byDate, bookings, settings);
const budHtml = bud.serialize();
const grand = items.reduce((a, i) => a + (i.cost ?? 0), 0) + bookings.reduce((a, b) => a + (b.cost ?? 0), 0);
ok('총 지출 표시', budHtml.includes(model.formatMoney(grand, settings)),
  `기대 ${model.formatMoney(grand, settings)}`);
ok('구분별 섹션', budHtml.includes('구분별'));
ok('일자별 섹션', budHtml.includes('일자별'));
ok('막대 폭이 % 로', /width:\d+%/.test(budHtml));

const budEmpty = box();
renderBudget(budEmpty, new Map([['2026-01-01', [{ kind: '관광', cost: null }]]]), [], settings);
ok('비용 없으면 안내', budEmpty.serialize().includes('비용이 입력된 항목이 없습니다'));

const badges = box();
renderDayBookings(badges, model.bookingsForDate(bookings, '2026-09-15'), '2026-09-15');
ok('중간 날짜는 "숙박"', badges.serialize().includes('숙박'));
ok('배지 표시됨', badges.hidden === false);

const badgesIn = box();
renderDayBookings(badgesIn, model.bookingsForDate(bookings, '2026-09-13'), '2026-09-13');
ok('체크인 날 라벨', badgesIn.serialize().includes('체크인 15:00'));

const badgesOut = box();
renderDayBookings(badgesOut, model.bookingsForDate(bookings, '2026-09-17'), '2026-09-17');
ok('체크아웃 날 라벨', badgesOut.serialize().includes('체크아웃 10:00'));

const noBadge = box();
renderDayBookings(noBadge, [], '2026-09-13');
ok('예약 없으면 숨김', noBadge.hidden === true);

const bl = box();
renderBookingList(bl, bookings, settings);
const blHtml = bl.serialize();
ok('예약 카드 3개', (blHtml.match(/<article \.booking/g) || []).length === 3);
ok('숙소 날짜 범위 표기', blHtml.includes('9월 13일 (일) → 9월 17일 (목)'));
ok('예약번호 표시', blHtml.includes('****9876'));

// ── 경계 케이스 ─────────────────────────────────────────────
section('경계 케이스');
const edge = model.buildItinerary([
  { 날짜: '2026-09-13', 시작: '', 구분: '', 제목: '종일 일정', 장소: '', 좌표: '', 비용: '' },
  { 날짜: '2026-09-13', 시작: '10:00', 제목: '오전 일정' },
  { 날짜: '', 제목: '날짜 이어받음' },       // 하루의 첫 행에만 날짜를 적는 시트 대응
  { 날짜: '2026-09-13', 제목: '', 장소: '' }, // 내용이 없으면 제외
]);
eq('내용 없는 행은 제외', edge.length, 3);
eq('날짜는 위에서 이어받음', edge[2].date, '2026-09-13');
const edgeDay = model.groupByDate(edge).get('2026-09-13');
eq('시각 있는 일정이 먼저', edgeDay.map(i => i.title), ['오전 일정', '종일 일정', '날짜 이어받음']);
eq('구분 비면 기타', edgeDay[1].kind, '기타');

// 첫 행에 날짜가 없으면 이어받을 게 없어 제외됩니다
eq('맨 앞 행은 이어받을 날짜가 없음',
  model.buildItinerary([{ 날짜: '', 제목: '고아 행' }]).length, 0);

// 헤더 없는 설정 탭 + 키에 공백
const s2 = model.buildSettings([['여행 제목', '미야코지마'], ['통화 기호', '¥'], ['지도줌', '12']]);
eq('공백 있는 키 인식', [s2.title, s2.currencySymbol, s2.mapZoom], ['미야코지마', '¥', 12]);

// 준비물
const pk = model.buildPacking([{ 준비물: '여권' }, { 준비물: '' }, { 준비물: '수영복' }]);
eq('준비물 빈 행 제외', pk.map(p => p.name), ['여권', '수영복']);
eq('분류 없으면 기타', pk[0].category, '기타');

const edgeTl = box();
renderTimeline(edgeTl, edgeDay, settings);
ok('시간 미정 표기', edgeTl.serialize().includes('시간 미정'));
ok('좌표 둘 다 없으면 구간링크 없음', !edgeTl.serialize().includes('길찾기'));

// 별칭 컬럼명
const alias = model.buildItinerary([{ 일자: '2026-09-13', start: '09:00', 내용: '별칭 테스트', 금액: '1,000' }]);
eq('컬럼 별칭 인식', [alias.length, alias[0]?.title, alias[0]?.cost, alias[0]?.start],
  [1, '별칭 테스트', 1000, '09:00']);

console.log(`\n${'─'.repeat(46)}\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
