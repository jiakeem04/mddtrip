// Leaflet + OpenStreetMap. API 키가 필요 없습니다.
// 기본 마커는 PNG 아이콘 파일에 의존하므로, divIcon + CSS로 번호 마커를 직접 그립니다.

import { kindMeta, colorClass } from './model.js';
import { searchUrl } from './maplinks.js';

let map = null;
let dayLayer = null;

export function initMap(el, center, zoom) {
  if (map) return map;

  map = L.map(el, {
    zoomControl: true,
    scrollWheelZoom: false, // 페이지 스크롤 중 지도가 확대되지 않도록
  }).setView(center, zoom);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
  }).addTo(map);

  dayLayer = L.layerGroup().addTo(map);
  return map;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function markerFor(item) {
  const meta = kindMeta(item.kind);
  const icon = L.divIcon({
    className: `pin ${colorClass(meta)}`,
    html: `<span class="pin__dot">${item.seq}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });

  // 시트에 적어 둔 구글 지도 링크가 있으면 그걸 우선합니다.
  const link = item.mapUrl || searchUrl(item);
  const popup = `
    <div class="pin-popup">
      <strong>${escapeHtml(item.title || item.place)}</strong>
      ${item.start ? `<span class="pin-popup__time">${escapeHtml(item.start)}</span>` : ''}
      ${item.place && item.place !== item.title ? `<span class="pin-popup__place">${escapeHtml(item.place)}</span>` : ''}
      ${link ? `<a href="${link}" target="_blank" rel="noopener">구글 지도에서 열기 →</a>` : ''}
    </div>`;

  return L.marker(item.coord, { icon }).bindPopup(popup);
}

/** 선택된 날짜의 핀과 동선을 다시 그립니다. 좌표가 없는 일정은 조용히 건너뜁니다. */
export function renderDay(items) {
  if (!map || !dayLayer) return;
  dayLayer.clearLayers();

  const located = items.filter((it) => it.coord);
  if (!located.length) return;

  if (located.length > 1) {
    L.polyline(located.map((it) => it.coord), {
      className: 'route-line', // 색은 CSS에서 테마에 맞춰 정합니다
      weight: 2,
      opacity: 0.6,
      dashArray: '5, 6',
    }).addTo(dayLayer);
  }

  for (const item of located) markerFor(item).addTo(dayLayer);

  const bounds = L.latLngBounds(located.map((it) => it.coord));
  map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
}

/** 지도 컨테이너가 숨겨져 있다가 다시 보이면 타일이 깨지므로 크기를 다시 잡아줍니다. */
export function refreshSize() {
  if (map) map.invalidateSize();
}
