import { h, clear, extLink } from './dom.js';
import { bookingMeta, colorClass, formatMoney, formatDateLabel } from './model.js';
import { searchUrl } from './maplinks.js';

const STAY_KINDS = new Set(['숙소', '숙박']);

/** 그 날짜에 이 예약이 어떤 상태인지 한 줄로 나타냅니다. */
function dayStatus(booking, date) {
  const endDate = booking.endDate || booking.startDate;
  const isStart = booking.startDate === date;
  const isEnd = endDate === date;
  const isStay = STAY_KINDS.has(booking.kind);

  if (isStart && isEnd) {
    return [booking.startTime, booking.endTime].filter(Boolean).join(' – ');
  }
  if (isStart) {
    const label = isStay ? '체크인' : '시작';
    return booking.startTime ? `${label} ${booking.startTime}` : label;
  }
  if (isEnd) {
    const label = isStay ? '체크아웃' : '종료';
    return booking.endTime ? `${label} ${booking.endTime}` : label;
  }
  return isStay ? '숙박' : '이용 중';
}

/** 일정 화면 상단에 붙는 그 날의 예약 배지 */
export function renderDayBookings(container, bookings, date) {
  clear(container);
  if (!bookings.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  for (const b of bookings) {
    const meta = bookingMeta(b.kind);
    container.append(
      h('div', { class: `badge ${colorClass(meta)}` },
        h('span', { class: 'badge__icon' }, meta.icon),
        h('span', { class: 'badge__name' }, b.name || b.place),
        h('span', { class: 'badge__status' }, dayStatus(b, date)),
      )
    );
  }
}

function dateRange(booking) {
  if (!booking.startDate) return '';
  const start = formatDateLabel(booking.startDate).full;
  const endDate = booking.endDate || booking.startDate;
  if (endDate === booking.startDate) return start;
  return `${start} → ${formatDateLabel(endDate).full}`;
}

function timeRange(booking) {
  const parts = [];
  if (booking.startTime) parts.push(booking.startTime);
  if (booking.endTime) parts.push(booking.endTime);
  return parts.join(' – ');
}

/** 예약 화면의 전체 목록 */
export function renderBookingList(container, bookings, settings) {
  clear(container);

  if (!bookings.length) {
    container.append(
      h('p', { class: 'empty' }, '시트의 「예약」 탭에 항공·숙소를 적으면 여기에 표시됩니다.')
    );
    return;
  }

  for (const b of bookings) {
    const meta = bookingMeta(b.kind);
    const mapUrl = searchUrl({ coord: b.coord, place: b.place, title: b.name });

    container.append(
      h('article', { class: `booking ${colorClass(meta)}` },
        h('div', { class: 'booking__head' },
          h('span', { class: 'booking__kind' }, meta.icon, ' ', b.kind),
          b.cost !== null && h('span', { class: 'booking__cost' }, formatMoney(b.cost, settings)),
        ),
        h('h3', { class: 'booking__name' }, b.name || b.place),
        h('p', { class: 'booking__when' }, dateRange(b), timeRange(b) && ` · ${timeRange(b)}`),
        b.place && b.place !== b.name && h('p', { class: 'booking__place' }, b.place),
        b.ref && h('p', { class: 'booking__ref' }, '예약번호 ', h('code', null, b.ref)),
        b.note && h('p', { class: 'booking__note' }, b.note),
        h('div', { class: 'entry__actions' },
          mapUrl && extLink(mapUrl, 'btn btn--map', '📍 지도'),
          (b.links ?? []).map((url) => extLink(url, 'btn', '🔗 정보')),
        ),
      )
    );
  }
}
