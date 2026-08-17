// 실제 구글 시트에 대고 전체 파이프라인을 실행해, 화면에 무엇이 나오는지 확인합니다.
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// ── DOM / localStorage 스텁 ─────────────────────────────────
class NodeBase {
  constructor() { this.childNodes = []; }
  append(...k) { this.childNodes.push(...k.filter(Boolean)); }
  replaceChildren(...k) { this.childNodes = k; }
}
class TextNode extends NodeBase {
  constructor(t) { super(); this.text = String(t); }
}
class Element extends NodeBase {
  constructor(tag) {
    super();
    this.tagName = tag; this.attrs = {}; this.dataset = {};
    this._class = ''; this.hidden = false; this.checked = false;
    this.classList = {
      toggle: (c, on) => { if (on) this._class += ` ${c}`; },
      add: () => {}, remove: () => {},
    };
  }
  get className() { return this._class; }
  set className(v) { this._class = v; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener() {}
  set textContent(v) { this.childNodes = [new TextNode(v)]; }
  get textContent() { return this.text(); }
  text() {
    return this.childNodes.map(c => c instanceof TextNode ? c.text : c.text()).join('');
  }
  render(d = 0) {
    const pad = '  '.repeat(d);
    const cls = this._class ? `.${this._class.trim().split(/\s+/).join('.')}` : '';
    const href = this.attrs.href ? ` href=${this.attrs.href}` : '';
    const kids = this.childNodes.map(c =>
      c instanceof TextNode
        ? (c.text.trim() ? `${pad}  ${c.text}` : null)
        : c.render(d + 1)).filter(Boolean).join('\n');
    return `${pad}${this.tagName}${cls}${href}` + (kids ? '\n' + kids : '');
  }
}
globalThis.Node = NodeBase;
globalThis.document = {
  createElement: (t) => new Element(t),
  createTextNode: (t) => new TextNode(t),
};
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
};

// ── 실행 ────────────────────────────────────────────────────
const { loadAll } = await import(`${ROOT}/assets/js/sheets.js`);
const M = await import(`${ROOT}/assets/js/model.js`);
const { renderTimeline } = await import(`${ROOT}/assets/js/timeline.js`);
const { renderBudget } = await import(`${ROOT}/assets/js/budget.js`);
const { renderPacking } = await import(`${ROOT}/assets/js/packing.js`);
const { dayRouteUrl } = await import(`${ROOT}/assets/js/maplinks.js`);

const raw = await loadAll();
console.log(`데이터 원본: ${raw.source}`);
console.log(`건너뛴 탭: ${raw.skippedTabs.length ? raw.skippedTabs.join(', ') : '없음'}`);
console.log(`원시 행수 — 설정 ${raw.settings.length} · 일정 ${raw.itinerary.length} · 준비물 ${raw.packing.length} · 예약 ${raw.bookings.length}`);

const settings = M.buildSettings(raw.settings);
console.log('\n══ 설정 ══');
console.log({
  제목: settings.title, 부제: settings.subtitle,
  시작일: settings.startDate, 종료일: settings.endDate,
  통화: settings.currency + ' ' + settings.currencySymbol,
  시간대: settings.timezone,
  지도중심: settings.mapCenter, 지도줌: settings.mapZoom,
});

const items = M.buildItinerary(raw.itinerary, settings);
const byDate = M.groupByDate(items);
const packing = M.buildPacking(raw.packing);

console.log(`\n══ 일정: ${items.length}건 / ${byDate.size}일 ══`);
for (const [date, list] of byDate) {
  const label = M.formatDateLabel(date);
  const route = dayRouteUrl(list);
  console.log(`\n── ${date} ${label.full} · ${list.length}건 · 좌표 ${list.filter(i => i.coord).length}건`);
  for (const it of list) {
    const bits = [
      String(it.seq).padStart(2),
      (it.start ?? '  ―  ').padEnd(6),
      `[${it.kind}]`.padEnd(6),
      it.title,
    ];
    const extra = [];
    if (it.coord) extra.push('📍');
    if (it.transport) extra.push(`→${it.transport}`);
    if (it.cost !== null) extra.push(M.formatMoney(it.cost, settings));
    if (it.links.length) extra.push(`🔗${it.links.length}`);
    if (it.note) extra.push(`"${it.note}"`);
    console.log('  ' + bits.join(' ') + (extra.length ? '   ' + extra.join(' ') : ''));
  }
  console.log(`  하루 전체 길찾기: ${route ? new URL(route.url).searchParams.get('travelmode') + (route.dropped ? ` (${route.dropped}곳 누락)` : '') : '없음(지점 부족)'}`);
}

// 렌더 실행
const box = () => new Element('div');
const day1 = [...byDate.values()][0] ?? [];
const tl = box();
renderTimeline(tl, day1, settings);
console.log('\n══ Day1 타임라인 렌더 (구조) ══');
console.log(tl.render().split('\n').filter(l => /article|connector|btn|entry__title/.test(l)).join('\n'));

const bud = box();
renderBudget(bud, byDate, [], settings);
console.log('\n══ 예산 ══');
console.log(bud.text().replace(/\s+/g, ' ').trim().slice(0, 300));

const pk = box();
renderPacking(pk, packing);
console.log(`\n══ 준비물: ${packing.length}건 ══`);
console.log(packing.map(p => `  [${p.category}] ${p.name}${p.owner ? ' @' + p.owner : ''}`).join('\n'));

// 데이터 위생 점검
console.log('\n══ 점검 ══');
const warn = [];
for (const it of items) {
  if (!it.coord && !it.place) warn.push(`좌표·장소 모두 없음: ${it.date} ${it.title}`);
}
const linkColText = raw.itinerary
  .map(r => Object.entries(r).find(([k]) => /관련|참고|링크|link/i.test(k))?.[1])
  .filter(v => v && !/^https?:\/\//i.test(v));
if (linkColText.length) warn.push(`링크 칸에 URL 아닌 값: ${JSON.stringify(linkColText)}`);
if (settings.mapCenter && (settings.mapCenter[0] > 30 || settings.mapCenter[1] > 130)) {
  warn.push(`지도중심이 여행지와 멀어 보입니다: ${settings.mapCenter}`);
}
console.log(warn.length ? warn.map(w => '  ⚠ ' + w).join('\n') : '  이상 없음');
