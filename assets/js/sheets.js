import { CONFIG } from '../../config.js';

const GVIZ_BASE = 'https://docs.google.com/spreadsheets/d';

// ── CSV 파서 ────────────────────────────────────────────────
// 따옴표로 감싼 필드, 필드 안의 쉼표·줄바꿈, 이스케이프된 따옴표("")를 처리합니다.
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM 제거

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }

    field += c;
    i++;
  }

  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * 첫 행을 헤더로 삼아 객체 배열로 바꿉니다.
 * 헤더가 비어 있는 열은 위치 이름(`열1`, `열2`…)으로 남겨 둡니다.
 * 시트에서 헤더를 깜빡한 열의 데이터가 통째로 사라지는 걸 막기 위해서입니다.
 */
export function rowsToObjects(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map((h, i) => {
    const name = h.trim();
    return name || `열${i + 1}`;
  });

  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const o = {};
      headers.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim(); });
      return o;
    });
}

// ── 불러오기 ────────────────────────────────────────────────

/**
 * 항상 `headers=0` 으로 받습니다. 헤더 처리는 우리가 직접 합니다.
 *
 * gviz에 헤더 행이 있다고 알려주면 남은 행들로 컬럼 타입을 추론하는데,
 * 한 열에 텍스트 셀과 시각 셀이 섞여 있으면 다른 타입인 셀을 **빈 값으로 지워서** 돌려줍니다.
 * (시간 열에 08:25는 사라지고 12:00만 남는 식으로요.)
 * headers=0 이면 헤더 행의 글자 때문에 열 전체가 문자열로 잡혀, 모든 셀이 보이는 그대로 옵니다.
 */
function gvizUrl(sheetId, tab) {
  const params = new URLSearchParams({
    tqx: 'out:csv',
    headers: '0',
    sheet: tab,
    _t: String(Date.now()), // 캐시 우회
  });
  return `${GVIZ_BASE}/${sheetId}/gviz/tq?${params}`;
}

// 설정 탭은 `키 / 값` 두 열이라 헤더 행이 없는 경우가 많습니다.
// 첫 행을 헤더로 떼어내면 설정 하나가 통째로 사라지므로, 모든 행을 데이터로 씁니다.
const RAW_KINDS = new Set(['settings']);

function bust(url) {
  return url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
}

async function fetchCsvText(url) {
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // 시트가 비공개이거나 탭 이름이 틀리면 구글이 CSV 대신 HTML 오류 페이지를 돌려줍니다.
  if (/^\s*</.test(text)) {
    throw new Error('CSV 대신 HTML이 돌아왔습니다. 시트 공개 설정과 탭 이름을 확인해 주세요.');
  }
  return text;
}

function describeFailure(err, tabName) {
  // 비공개 시트는 로그인 페이지로 리다이렉트되고, CORS에 막혀 TypeError로 나타납니다.
  if (err instanceof TypeError) {
    return `'${tabName}' 탭을 읽지 못했습니다. 시트 공유를 "링크가 있는 모든 사용자 · 뷰어"로 바꿨는지 확인해 주세요.`;
  }
  return `'${tabName}' 탭을 읽지 못했습니다. ${err.message}`;
}

/** 탭 하나를 읽습니다. gviz가 실패하면 게시 CSV로 한 번 더 시도합니다. */
async function loadOneTab(tabName, kind) {
  const raw = RAW_KINDS.has(kind);
  const attempts = [gvizUrl(CONFIG.sheetId, tabName)];

  const published = CONFIG.publishedCsv?.[kind];
  if (published) attempts.push(bust(published));

  let lastErr;
  for (const url of attempts) {
    try {
      const rows = parseCsv(await fetchCsvText(url));
      return raw ? rows : rowsToObjects(rows);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(describeFailure(lastErr, tabName));
}

/**
 * 한 종류를 읽습니다. 탭 이름이 배열이면 순서대로 읽어 이어 붙입니다.
 * 일부 탭만 실패하면(아직 안 만든 탭 등) 그 탭만 건너뛰고, 전부 실패해야 오류로 봅니다.
 */
async function loadKind(kind, useSample) {
  if (useSample) {
    try {
      const rows = parseCsv(await fetchCsvText(bust(`./sample/${kind}.csv`)));
      return { rows: RAW_KINDS.has(kind) ? rows : rowsToObjects(rows), skipped: [] };
    } catch {
      return { rows: [], skipped: [] };
    }
  }

  const spec = CONFIG.tabs[kind];
  const tabNames = (Array.isArray(spec) ? spec : [spec]).filter(Boolean);
  if (!tabNames.length) return { rows: [], skipped: [] };

  const settled = await Promise.all(
    tabNames.map((tab) =>
      loadOneTab(tab, kind).then(
        (rows) => ({ tab, rows }),
        (err) => ({ tab, err })
      )
    )
  );

  const good = settled.filter((r) => r.rows);
  if (!good.length) throw settled[0].err;

  return {
    rows: good.flatMap((r) => r.rows),
    skipped: settled.filter((r) => r.err).map((r) => r.tab),
  };
}

/**
 * 모든 탭을 한 번에 불러옵니다.
 * 일정은 필수, 나머지는 없어도 빈 배열로 넘어갑니다.
 */
export async function loadAll() {
  const useSample = CONFIG.forceSampleData || !CONFIG.sheetId;

  const [settings, itinerary, packing, bookings] = await Promise.all([
    loadKind('settings', useSample).catch(() => ({ rows: [], skipped: [] })),
    loadKind('itinerary', useSample),
    loadKind('packing', useSample).catch(() => ({ rows: [], skipped: [] })),
    loadKind('bookings', useSample).catch(() => ({ rows: [], skipped: [] })),
  ]);

  return {
    settings: settings.rows,
    itinerary: itinerary.rows,
    packing: packing.rows,
    bookings: bookings.rows,
    skippedTabs: itinerary.skipped,
    source: useSample ? 'sample' : 'sheet',
  };
}
