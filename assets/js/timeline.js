import { h, clear, extLink } from './dom.js';
import { kindMeta, colorClass, transportIcon, formatMoney, linkLabel } from './model.js';
import { searchUrl, directionsUrl, hasLocation, travelMode, isAirTravel } from './maplinks.js';

const MODE_LABEL = {
  walking: '도보',
  transit: '대중교통',
  driving: '자동차',
  bicycling: '자전거',
};

function timeRange(item) {
  if (item.start && item.end) return `${item.start} – ${item.end}`;
  if (item.start) return item.start;
  return '시간 미정';
}

/** 시트에 적어 둔 구글 지도 링크가 있으면 그걸 우선합니다. 없으면 좌표·장소로 검색합니다. */
function mapLinkOf(item) {
  return item.mapUrl || searchUrl(item);
}

function linkButtons(links) {
  if (!links?.length) return [];
  if (links.length === 1) return [extLink(links[0], 'btn', '🔗 정보')];
  // 여러 개면 도메인으로 구분합니다. 같은 도메인이 여럿일 수 있어 번호도 붙입니다.
  return links.map((url, i) => extLink(url, 'btn', `🔗 ${linkLabel(url)} ${i + 1}`));
}

function entryCard(item, settings) {
  const meta = kindMeta(item.kind);
  const mapUrl = mapLinkOf(item);

  return h('article', { class: `entry ${colorClass(meta)}` },
    h('div', { class: 'entry__rail' },
      h('span', { class: 'entry__seq' }, item.seq),
    ),
    h('div', { class: 'entry__body' },
      h('div', { class: 'entry__head' },
        h('span', { class: 'entry__time' }, timeRange(item)),
        h('span', { class: 'entry__kind' }, meta.icon, ' ', item.kind),
        item.cost !== null && h('span', { class: 'entry__cost' }, formatMoney(item.cost, settings)),
      ),
      h('h3', { class: 'entry__title' }, item.title || item.place),
      item.place && item.place !== item.title &&
        h('p', { class: 'entry__place' }, item.place),
      item.note && h('p', { class: 'entry__note' }, item.note),
      h('div', { class: 'entry__actions' },
        mapUrl && extLink(mapUrl, 'btn btn--map', '📍 지도'),
        linkButtons(item.links),
      ),
    ),
  );
}

/**
 * 두 일정 사이를 잇는 길찾기 줄.
 * 이동수단은 **도착하는 쪽**(to)의 「이동」 칸에서 가져옵니다.
 * 시트에는 '이 일정에 어떻게 갔는지'를 적기 때문입니다.
 */
function connector(from, to) {
  const icon = transportIcon(to.transport);

  // 항공 구간은 구글 지도가 경로를 못 냅니다. 이동수단만 표시하고 링크는 안 겁니다.
  if (isAirTravel(to.transport)) {
    return h('div', { class: 'connector' },
      h('span', { class: 'connector__icon' }, icon),
      h('span', { class: 'connector__plain' }, to.transport),
    );
  }

  const mode = travelMode(to.transport);
  const url = directionsUrl(from, to, mode);
  if (!url) return null;

  const label = to.transport || MODE_LABEL[mode];
  return h('div', { class: 'connector' },
    h('span', { class: 'connector__icon' }, icon),
    extLink(url, 'connector__link', `${label}로 이동 · 길찾기`),
  );
}

export function renderTimeline(container, items, settings) {
  clear(container);

  if (!items.length) {
    container.append(h('p', { class: 'empty' }, '이 날짜에 등록된 일정이 없습니다.'));
    return;
  }

  items.forEach((item, i) => {
    container.append(entryCard(item, settings));

    const next = items[i + 1];
    if (next && hasLocation(item) && hasLocation(next)) {
      const link = connector(item, next);
      if (link) container.append(link);
    }
  });
}
