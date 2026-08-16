// 시트에서 읽은 원시 문자열을 화면에서 쓸 수 있는 형태로 정규화합니다.
// 시트 입력은 사람이 손으로 하는 것이라, 파서는 최대한 관대하게 동작합니다.

// 색상 값 자체는 CSS(`assets/style.css`)에 있습니다.
// 라이트·다크에서 같은 색을 쓸 수 없어서(밝은 배경엔 짙은 색, 어두운 배경엔 옅은 색이 필요합니다)
// 여기서는 어떤 색인지만 가리키고, 실제 값은 `.c-<slug>` 클래스가 모드별로 정합니다.
export const KIND_META = {
  이동: { icon: '🚕', slug: 'blue' },
  식사: { icon: '🍽️', slug: 'amber' },
  관광: { icon: '📷', slug: 'teal' },
  쇼핑: { icon: '🛍️', slug: 'pink' },
  숙박: { icon: '🛏️', slug: 'purple' },
  휴식: { icon: '☕', slug: 'slate' },
  기타: { icon: '📌', slug: 'slate' },
};

export const BOOKING_META = {
  항공: { icon: '✈️', slug: 'blue' },
  숙소: { icon: '🛏️', slug: 'purple' },
  숙박: { icon: '🛏️', slug: 'purple' },
  기차: { icon: '🚄', slug: 'teal' },
  렌터카: { icon: '🚗', slug: 'amber' },
  티켓: { icon: '🎟️', slug: 'pink' },
  기타: { icon: '📌', slug: 'slate' },
};

/** 색을 입힐 요소에 붙일 클래스. `--kind-color` 를 그 색으로 정의해 줍니다. */
export function colorClass(meta) {
  return `c-${meta?.slug ?? 'slate'}`;
}

export const TRANSPORT_ICON = {
  도보: '🚶', 걷기: '🚶',
  전철: '🚃', 지하철: '🚇', 기차: '🚄', 모노레일: '🚝',
  버스: '🚌', 대중교통: '🚃',
  택시: '🚕', 자동차: '🚗', 렌터카: '🚗', 렌트카: '🚗',
  자전거: '🚲', 비행기: '✈️', 항공: '✈️', 페리: '⛴️', 배: '⛴️',
};

export function kindMeta(kind) {
  return KIND_META[kind?.trim()] ?? KIND_META['기타'];
}

export function bookingMeta(kind) {
  return BOOKING_META[kind?.trim()] ?? BOOKING_META['기타'];
}

export function transportIcon(transport) {
  if (!transport) return '→';
  const t = transport.trim();
  for (const [key, icon] of Object.entries(TRANSPORT_ICON)) {
    if (t.includes(key)) return icon;
  }
  return '→';
}

// ── 컬럼 이름 매칭 ──────────────────────────────────────────
// 사용자가 컬럼 이름을 조금 다르게 적어도 읽히도록 별칭을 둡니다.
// 비교할 때 공백과 대소문자는 무시하므로 '관련 링크'와 '관련링크'는 같습니다.
const ALIASES = {
  날짜: ['날짜', '일자', 'date'],
  시작: ['시작', '시간', '시각', '시작시간', '시작시각', 'start', 'time'],
  종료: ['종료', '종료시간', '종료시각', 'end'],
  구분: ['구분', '분류', '카테고리', 'type', 'category'],
  제목: ['제목', '일정', '내용', 'title'],
  장소: ['장소', '위치', '장소명', 'place', 'location'],
  좌표: ['좌표', '위경도', '위도경도', 'coord', 'latlng'],
  지도링크: ['구글 맵 위치', '구글맵', '구글지도', '지도링크', '지도', 'map', 'maps'],
  이동수단: ['이동수단', '이동', '교통', '교통수단', 'transport'],
  비용: ['비용', '금액', '가격', 'cost', 'price'],
  메모: ['메모', '비고', '노트', 'memo'],
  링크: ['링크', '관련 링크', '참고 링크', '참고링크', 'url', 'link'],
  이름: ['이름', '명칭', 'name'],
  시작일: ['시작일', '체크인', '출발일', '날짜'],
  시작시각: ['시작시각', '시작시간', '체크인시각', '출발시각', '시작'],
  종료일: ['종료일', '체크아웃', '도착일'],
  종료시각: ['종료시각', '종료시간', '체크아웃시각', '도착시각', '종료'],
  예약번호: ['예약번호', '확인번호', '예약코드', 'ref', 'confirmation'],
  준비물: ['준비물', '항목', '물품', 'item'],
  담당자: ['담당자', '담당', '맡은사람', 'owner'],
};

const normalize = (s) => s.replace(/\s+/g, '').toLowerCase();

function pick(row, canonical) {
  const names = ALIASES[canonical] ?? [canonical];
  for (const name of names) {
    const target = normalize(name);
    for (const key of Object.keys(row)) {
      if (normalize(key) === target) return row[key];
    }
  }
  return '';
}

// ── 값 파서 ────────────────────────────────────────────────

function iso(y, m, d) {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * 여러 표기를 받아 `YYYY-MM-DD` 문자열로 정규화합니다.
 * `9/3 (목)` 처럼 연도가 없는 표기는 yearHint 가 있을 때만 읽습니다.
 */
export function parseDate(raw, yearHint) {
  if (!raw) return null;
  const original = String(raw).trim();
  if (!original) return null;
  let m;

  // Date(2026,8,3) — gviz 내부 표기가 새어나온 경우 (월이 0부터 시작).
  // 괄호를 쓰는 표기라 아래 요일 제거보다 먼저 확인해야 합니다.
  if ((m = original.match(/^Date\((\d+),\s*(\d+),\s*(\d+)/))) {
    return iso(+m[1], +m[2] + 1, +m[3]);
  }

  // '9/3 (목)' 처럼 뒤에 붙은 요일 표기를 떼어냅니다.
  const s = original.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!s) return null;

  // 2026-09-03 / 2026.9.3 / 2026/9/3 / 2026. 9. 3.
  if ((m = s.match(/^(\d{4})[-./\s]+(\d{1,2})[-./\s]+(\d{1,2})\.?$/))) {
    return iso(+m[1], +m[2], +m[3]);
  }
  // 9/3/2026 — gviz가 기본 로케일로 내보낼 때의 형태
  if ((m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/))) {
    return iso(+m[3], +m[1], +m[2]);
  }
  // 9/3 · 9.3 — 연도가 없으므로 힌트가 있어야 읽습니다.
  if (yearHint && (m = s.match(/^(\d{1,2})[-./](\d{1,2})\.?$/))) {
    return iso(yearHint, +m[1], +m[2]);
  }
  return null;
}

/** `09:30` 형태로 정규화합니다. 오전/오후·AM/PM·`9시 30분`을 처리합니다. */
export function parseTime(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  const isPm = /오후|PM/i.test(s);
  const isAm = /오전|AM/i.test(s);
  s = s.replace(/오전|오후|AM|PM/gi, '').trim();

  const m = s.match(/^(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if (!m) return null;

  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (isPm && h < 12) h += 12;
  if (isAm && h === 12) h = 0;
  if (h > 23 || min > 59) return null;

  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * `24.8039, 125.2761` 을 [lat, lng]로 바꿉니다.
 * 구글 지도 URL을 통째로 붙여넣은 경우에도 좌표를 뽑아냅니다.
 * 단, `maps.app.goo.gl` 단축링크에는 좌표가 없어 읽을 수 없습니다.
 */
export function parseCoord(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const patterns = [
    /^(-?\d{1,3}(?:\.\d+)?)\s*[,/]\s*(-?\d{1,3}(?:\.\d+)?)$/, // 24.8039, 125.2761
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,                 // 구글 지도 place URL
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,                     // .../@24.80,125.27,17z
    /[?&]q=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /[?&]ll=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
  ];

  for (const p of patterns) {
    const m = s.match(p);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng];
  }
  return null;
}

/** `¥1,200` `1200엔` `1,200` 등에서 숫자만 뽑습니다. 빈 칸은 null. */
export function parseMoney(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/[^\d.-]/g, '');
  if (!s || s === '-' || s === '.') return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/** 한 칸에 줄바꿈으로 여러 URL이 들어있는 경우를 모두 뽑아냅니다. */
export function parseLinks(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/\s+/)
    .map((s) => s.trim().replace(/[),.]+$/, ''))
    .filter((s) => /^https?:\/\//i.test(s));
}

/** 링크 버튼에 붙일 짧은 이름. `blog.naver.com` 처럼 도메인만 씁니다. */
export function linkLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '링크';
  }
}

// ── 도메인 객체 만들기 ──────────────────────────────────────

/**
 * 설정 탭은 `키 / 값` 두 열입니다. 헤더 행이 있든 없든 동작하도록
 * 모든 행을 데이터로 보고, 키는 공백을 무시해 맞춥니다. (`여행 제목` == `여행제목`)
 */
export function buildSettings(rows) {
  const map = {};
  for (const row of rows) {
    const cells = Array.isArray(row) ? row : Object.values(row);
    const k = normalize(String(cells[0] ?? ''));
    const v = String(cells[1] ?? '').trim();
    if (k) map[k] = v;
  }

  const get = (...names) => {
    for (const n of names) {
      const v = map[normalize(n)];
      if (v) return v;
    }
    return '';
  };

  const startDate = parseDate(get('시작일'));
  return {
    title: get('여행제목', '제목') || '여행 일정',
    subtitle: get('부제', '부제목'),
    startDate,
    endDate: parseDate(get('종료일')),
    currency: get('통화'),
    currencySymbol: get('통화기호'),
    timezone: get('시간대'),
    mapCenter: parseCoord(get('지도중심')),
    mapZoom: get('지도줌') ? parseInt(get('지도줌'), 10) : null,
    yearHint: startDate ? Number(startDate.slice(0, 4)) : null,
    raw: map,
  };
}

/**
 * 날짜 열을 찾습니다. 헤더가 비어 있거나 이름이 달라도,
 * 값이 날짜처럼 보이는 열이 있으면 그걸 씁니다.
 * (시트에서 A1 헤더를 빠뜨렸을 때 화면이 통째로 비는 걸 막습니다.)
 */
function detectDateKey(rows, yearHint) {
  if (!rows.length) return null;
  if (rows.some((r) => parseDate(pick(r, '날짜'), yearHint))) return null; // 별칭으로 충분

  for (const key of Object.keys(rows[0])) {
    const values = rows.map((r) => r[key]).filter(Boolean);
    if (values.length < 2) continue;
    const hits = values.filter((v) => parseDate(v, yearHint)).length;
    if (hits / values.length >= 0.6) return key;
  }
  return null;
}

export function buildItinerary(rows, settings = {}) {
  const yearHint = settings.yearHint ?? null;
  const dateKey = detectDateKey(rows, yearHint);

  let lastDate = null;
  return rows
    .map((row, idx) => {
      const rawDate = dateKey ? row[dateKey] : pick(row, '날짜');
      // 날짜를 매 행에 적지 않고 하루의 첫 행에만 적는 시트도 있어서, 아래로 이어 받습니다.
      const date = parseDate(rawDate, yearHint) ?? lastDate;
      if (date) lastDate = date;

      const mapUrl = pick(row, '지도링크').trim();

      return {
        idx,
        date,
        start: parseTime(pick(row, '시작')),
        end: parseTime(pick(row, '종료')),
        kind: (pick(row, '구분') || '기타').trim(),
        title: pick(row, '제목').trim(),
        place: pick(row, '장소').trim(),
        coord: parseCoord(pick(row, '좌표')) ?? parseCoord(mapUrl),
        mapUrl,
        transport: pick(row, '이동수단').trim(),
        cost: parseMoney(pick(row, '비용')),
        note: pick(row, '메모').trim(),
        links: parseLinks(pick(row, '링크')),
      };
    })
    .filter((it) => it.date && (it.title || it.place));
}

export function buildBookings(rows) {
  return rows
    .map((row, idx) => ({
      idx,
      kind: (pick(row, '구분') || '기타').trim(),
      name: pick(row, '이름').trim(),
      startDate: parseDate(pick(row, '시작일')),
      startTime: parseTime(pick(row, '시작시각')),
      endDate: parseDate(pick(row, '종료일')),
      endTime: parseTime(pick(row, '종료시각')),
      place: pick(row, '장소').trim(),
      coord: parseCoord(pick(row, '좌표')),
      ref: pick(row, '예약번호').trim(),
      cost: parseMoney(pick(row, '비용')),
      note: pick(row, '메모').trim(),
      links: parseLinks(pick(row, '링크')),
    }))
    .filter((b) => b.name || b.place)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '') || a.idx - b.idx);
}

export function buildPacking(rows) {
  return rows
    .map((row, idx) => ({
      idx,
      category: (pick(row, '구분') || '기타').trim(),
      name: (pick(row, '준비물') || pick(row, '제목') || pick(row, '이름')).trim(),
      owner: pick(row, '담당자').trim(),
      note: pick(row, '메모').trim(),
    }))
    .filter((p) => p.name);
}

/**
 * 날짜별로 묶고 하루 안에서 정렬합니다.
 * 시각이 있는 일정이 시간순으로 먼저 오고, 시각이 없는 일정은 시트에 적은 순서대로 뒤에 붙습니다.
 * @returns {Map<string, object[]>} 날짜 오름차순
 */
export function groupByDate(items) {
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.date)) map.set(it.date, []);
    map.get(it.date).push(it);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.start && b.start) return a.start.localeCompare(b.start) || a.idx - b.idx;
      if (a.start) return -1;
      if (b.start) return 1;
      return a.idx - b.idx;
    });
    list.forEach((it, i) => { it.seq = i + 1; });
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** 해당 날짜에 걸쳐 있는 예약(숙소는 체크인~체크아웃 사이 모든 날)을 고릅니다. */
export function bookingsForDate(bookings, date) {
  return bookings.filter((b) => {
    if (!b.startDate) return false;
    const end = b.endDate || b.startDate;
    return date >= b.startDate && date <= end;
  });
}

/** 브라우저가 어디에 있든 여행지 기준의 '오늘'을 구합니다. */
export function todayInTimezone(timezone) {
  try {
    // en-CA 로케일은 YYYY-MM-DD 형태로 포맷합니다.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || undefined,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    const d = new Date();
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDateLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { month: m, day: d, weekday: wd, full: `${m}월 ${d}일 (${wd})` };
}

export function formatMoney(amount, settings) {
  if (amount === null || amount === undefined) return '';
  const num = amount.toLocaleString('ko-KR');
  const symbol = settings?.currencySymbol;
  if (symbol) return `${symbol}${num}`;
  if (settings?.currency) return `${num} ${settings.currency}`;
  return num;
}
