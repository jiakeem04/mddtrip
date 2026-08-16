import { h, clear } from './dom.js';
import { kindMeta, bookingMeta, colorClass, formatMoney, formatDateLabel } from './model.js';

function sum(values) {
  return values.reduce((acc, v) => acc + (v ?? 0), 0);
}

function bar(label, amount, max, settings, colorCls = 'c-accent') {
  const pct = max > 0 ? Math.round((amount / max) * 100) : 0;
  return h('div', { class: `bar ${colorCls}` },
    h('div', { class: 'bar__head' },
      h('span', { class: 'bar__label' }, label),
      h('span', { class: 'bar__value' }, formatMoney(amount, settings)),
    ),
    h('div', { class: 'bar__track' },
      h('div', { class: 'bar__fill', style: `width:${pct}%` }),
    ),
  );
}

export function renderBudget(container, byDate, bookings, settings) {
  clear(container);

  const items = [...byDate.values()].flat();
  const hasAnyCost =
    items.some((i) => i.cost !== null) || bookings.some((b) => b.cost !== null);

  if (!hasAnyCost) {
    container.append(
      h('p', { class: 'empty' }, '비용이 입력된 항목이 없습니다. 시트의 「비용」 칸을 채우면 여기에 집계됩니다.')
    );
    return;
  }

  const itineraryTotal = sum(items.map((i) => i.cost));
  const bookingTotal = sum(bookings.map((b) => b.cost));
  const total = itineraryTotal + bookingTotal;

  // 총계
  container.append(
    h('div', { class: 'total' },
      h('span', { class: 'total__label' }, '총 지출'),
      h('strong', { class: 'total__amount' }, formatMoney(total, settings)),
      h('span', { class: 'total__break' },
        `현지 일정 ${formatMoney(itineraryTotal, settings)} · 예약 ${formatMoney(bookingTotal, settings)}`
      ),
    )
  );

  // 구분별
  const byKind = new Map();
  for (const it of items) {
    if (it.cost === null) continue;
    byKind.set(it.kind, (byKind.get(it.kind) ?? 0) + it.cost);
  }
  if (byKind.size) {
    const sorted = [...byKind.entries()].sort((a, b) => b[1] - a[1]);
    const max = sorted[0][1];
    container.append(
      h('section', { class: 'panel' },
        h('h2', { class: 'panel__title' }, '구분별'),
        sorted.map(([kind, amount]) => {
          const meta = kindMeta(kind);
          return bar(`${meta.icon} ${kind}`, amount, max, settings, colorClass(meta));
        }),
      )
    );
  }

  // 일자별
  const dayRows = [...byDate.entries()]
    .map(([date, list]) => [date, sum(list.map((i) => i.cost))])
    .filter(([, amount]) => amount > 0);

  if (dayRows.length) {
    const max = Math.max(...dayRows.map(([, a]) => a));
    container.append(
      h('section', { class: 'panel' },
        h('h2', { class: 'panel__title' }, '일자별'),
        dayRows.map(([date, amount]) =>
          bar(formatDateLabel(date).full, amount, max, settings)
        ),
      )
    );
  }

  // 예약 비용
  const paidBookings = bookings.filter((b) => b.cost !== null);
  if (paidBookings.length) {
    container.append(
      h('section', { class: 'panel' },
        h('h2', { class: 'panel__title' }, '예약'),
        h('ul', { class: 'linelist' },
          paidBookings.map((b) =>
            h('li', { class: 'linelist__row' },
              h('span', null, `${bookingMeta(b.kind).icon} ${b.name || b.place}`),
              h('span', { class: 'linelist__value' }, formatMoney(b.cost, settings)),
            )
          ),
        ),
      )
    );
  }

  container.append(
    h('p', { class: 'note' }, '시트에 적힌 금액을 그대로 더한 값입니다. 환율 환산은 하지 않습니다.')
  );
}
