import { h, clear } from './dom.js';
import { CONFIG } from '../../config.js';

// 체크 상태는 브라우저에 저장합니다. 서버가 없어서 기기별로만 유지되고,
// 일행끼리 공유되지는 않습니다. 같이 보려면 시트에서 체크하세요.
const STORE_KEY = `trip-packing:${CONFIG.sheetId || 'sample'}`;

const keyOf = (item) => `${item.category}|${item.name}`;

function loadChecked() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveChecked(set) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...set]));
  } catch {
    // 사파리 프라이빗 모드 등에서 저장이 막혀도 화면은 그대로 동작해야 합니다.
  }
}

export function renderPacking(container, items) {
  clear(container);

  if (!items.length) {
    container.append(
      h('p', { class: 'empty' }, '「03_준비물」 탭에 항목을 적으면 여기에 체크리스트로 나옵니다.')
    );
    return;
  }

  const checked = loadChecked();
  const progress = h('div', { class: 'progress' });

  const updateProgress = () => {
    const done = items.filter((it) => checked.has(keyOf(it))).length;
    const pct = Math.round((done / items.length) * 100);
    clear(progress);
    progress.append(
      h('div', { class: 'progress__head' },
        h('span', { class: 'progress__text' }, `${done} / ${items.length} 챙김`),
        h('span', { class: 'progress__pct' }, `${pct}%`),
      ),
      h('div', { class: 'progress__track' },
        h('div', { class: 'progress__fill', style: `width:${pct}%` }),
      ),
    );
  };

  container.append(progress);

  const byCategory = new Map();
  for (const item of items) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }

  for (const [category, list] of byCategory) {
    const section = h('section', { class: 'panel' },
      h('h2', { class: 'panel__title' }, category)
    );

    for (const item of list) {
      const isDone = checked.has(keyOf(item));

      const box = h('input', { type: 'checkbox', class: 'packrow__box' });
      box.checked = isDone;

      const row = h('label', { class: `packrow${isDone ? ' is-done' : ''}` },
        box,
        h('span', { class: 'packrow__name' }, item.name),
        item.owner && h('span', { class: 'packrow__owner' }, item.owner),
        item.note && h('span', { class: 'packrow__note' }, item.note),
      );

      box.addEventListener('change', () => {
        if (box.checked) checked.add(keyOf(item));
        else checked.delete(keyOf(item));
        saveChecked(checked);
        row.classList.toggle('is-done', box.checked);
        updateProgress();
      });

      section.append(row);
    }

    container.append(section);
  }

  updateProgress();

  container.append(
    h('p', { class: 'note' }, '체크는 이 브라우저에만 저장됩니다. 일행과 같이 보려면 시트에서 관리하세요.')
  );
}
