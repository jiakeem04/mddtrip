// 구글 지도 딥링크를 만듭니다. API 키가 필요 없는 공개 URL 규격만 사용합니다.
// 모바일에서는 이 주소가 구글 지도 앱으로 열려 실시간 환승·경로 안내로 이어집니다.
// https://developers.google.com/maps/documentation/urls/get-started

const MODE_BY_TRANSPORT = [
  [['도보', '걷기', 'walk'], 'walking'],
  [['자전거', 'bike', 'bicycle'], 'bicycling'],
  [['택시', '자동차', '렌터카', '차량', 'car', 'taxi', 'drive'], 'driving'],
  [['전철', '지하철', '기차', '버스', '대중교통', 'train', 'subway', 'bus', 'transit'], 'transit'],
];

export const MAX_WAYPOINTS = 9; // 구글 지도 URL API 제한

// 구글 지도는 항공 구간 길찾기를 못 합니다. 이런 구간엔 버튼을 붙이지 않습니다.
const AIR_KEYWORDS = ['비행기', '항공', 'flight'];

export function isAirTravel(transport) {
  if (!transport) return false;
  const t = String(transport).trim().toLowerCase();
  return AIR_KEYWORDS.some((k) => t.includes(k));
}

export function travelMode(transport) {
  if (!transport) return 'transit';
  const t = String(transport).trim().toLowerCase();
  for (const [keywords, mode] of MODE_BY_TRANSPORT) {
    if (keywords.some((k) => t.includes(k))) return mode;
  }
  return 'transit';
}

/**
 * 경로에 넣을 수 있는 지점인지. 좌표나 「장소」가 있어야 합니다.
 * 「제목」은 '자유시간'처럼 장소가 아닌 경우가 많아, 경로 계산에는 쓰지 않습니다.
 * 없는 경로를 있는 것처럼 안내하지 않기 위한 구분입니다.
 */
function waypointOf(item) {
  if (!item) return null;
  if (item.coord) return `${item.coord[0]},${item.coord[1]}`;
  return item.place || null;
}

/** 검색은 경로보다 관대합니다. 장소가 비어 있으면 제목으로 찾아봅니다. */
function searchTargetOf(item) {
  if (!item) return null;
  if (item.coord) return `${item.coord[0]},${item.coord[1]}`;
  return item.place || item.title || null;
}

export function hasLocation(item) {
  return waypointOf(item) !== null;
}

/** 장소 하나를 구글 지도에서 열기 */
export function searchUrl(item) {
  const q = searchTargetOf(item);
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/**
 * A → B 구간 길찾기.
 * 시트의 「이동」 칸은 '그 일정에 도착하는 수단'이라, 도착지 쪽 값을 씁니다.
 */
export function directionsUrl(from, to, mode) {
  const origin = waypointOf(from);
  const destination = waypointOf(to);
  if (!origin || !destination) return null;

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: mode || travelMode(to.transport),
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

/** 하루 전체 경로에 쓸 대표 이동수단. 그날 가장 많이 쓴 수단을 고릅니다. */
function dominantMode(items) {
  const tally = new Map();
  // 첫 일정의 「이동」은 '그날 첫 장소에 오는 방법'이라 구간 이동에서 제외합니다.
  for (const it of items.slice(1)) {
    if (!it.transport) continue;
    const mode = travelMode(it.transport);
    tally.set(mode, (tally.get(mode) ?? 0) + 1);
  }
  if (!tally.size) return 'transit';
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * 하루 전체 동선을 한 번에 길찾기.
 * 경유지는 9개까지만 허용되므로, 넘치면 몇 곳이 빠졌는지 함께 돌려줍니다.
 * @returns {{url: string, dropped: number} | null}
 */
export function dayRouteUrl(items) {
  const points = items.map(waypointOf).filter(Boolean);
  if (points.length < 2) return null;

  const origin = points[0];
  const destination = points[points.length - 1];
  const middle = points.slice(1, -1);
  const dropped = Math.max(0, middle.length - MAX_WAYPOINTS);
  const waypoints = middle.slice(0, MAX_WAYPOINTS);

  const params = new URLSearchParams({ api: '1', origin, destination });
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  params.set('travelmode', dominantMode(items));

  return { url: `https://www.google.com/maps/dir/?${params}`, dropped };
}
