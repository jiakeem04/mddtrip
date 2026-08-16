import { CONFIG } from '../../config.js';
import { loadAll } from './sheets.js';
import {
  buildSettings, buildItinerary, buildBookings, buildPacking,
  groupByDate, bookingsForDate, todayInTimezone,
  formatDateLabel, formatMoney,
} from './model.js';
import { initMap, renderDay, refreshSize } from './map.js';
import { renderTimeline } from './timeline.js';
import { renderBudget } from './budget.js';
import { renderDayBookings, renderBookingList } from './bookings.js';
import { renderPacking } from './packing.js';
import { dayRouteUrl } from './maplinks.js';
import { h, clear } from './dom.js';

const VIEWS = ['itinerary', 'budget', 'bookings', 'packing'];

const state = {
  settings: null,
  byDate: new Map(),
  bookings: [],
  packing: [],
  selectedDate: null,
  view: 'itinerary',
  lastLoadedAt: 0,
  mapReady: false,
};

const el = {};

function cacheElements() {
  const ids = [
    'tripTitle', 'tripSubtitle', 'updatedAt', 'refreshBtn', 'banner',
    'dateTabs', 'dayBookings', 'map', 'dayRoute', 'dayRouteNote',
    'timeline', 'dayTotal', 'budgetView', 'bookingList', 'packingList',
    'view-itinerary', 'view-budget', 'view-bookings', 'view-packing',
  ];
  for (const id of ids) el[id] = document.getElementById(id);
  el.navButtons = [...document.querySelectorAll('[data-view]')];
}

// ── 배너 ────────────────────────────────────────────────────

function showBanner(message, tone = 'error') {
  el.banner.textContent = message;
  el.banner.className = `banner banner--${tone}`;
  el.banner.hidden = false;
}

function hideBanner() {
  el.banner.hidden = true;
}

// ── 화면 전환 ───────────────────────────────────────────────

function setView(view) {
  state.view = view;
  for (const btn of el.navButtons) {
    btn.classList.toggle('is-active', btn.dataset.view === view);
    btn.setAttribute('aria-selected', String(btn.dataset.view === view));
  }
  for (const name of VIEWS) {
    el[`view-${name}`].hidden = name !== view;
  }
  // 숨겨져 있던 지도는 크기를 다시 계산해 줘야 타일이 제대로 깔립니다.
  if (view === 'itinerary') refreshSize();
}

/** 내용이 없는 화면의 탭은 숨깁니다. */
function syncNavVisibility() {
  const hasData = {
    itinerary: true,
    budget: true,
    bookings: state.bookings.length > 0,
    packing: state.packing.length > 0,
  };
  for (const btn of el.navButtons) {
    btn.hidden = !hasData[btn.dataset.view];
  }
  if (!hasData[state.view]) setView('itinerary');
}

// ── 날짜 ───────────────────────────────────────────────────

function renderDateTabs() {
  clear(el.dateTabs);
  const dates = [...state.byDate.keys()];

  dates.forEach((date, i) => {
    const label = formatDateLabel(date);
    el.dateTabs.append(
      h('button', {
        class: `datetab${date === state.selectedDate ? ' is-active' : ''}`,
        type: 'button',
        dataset: { date },
        onclick: () => selectDate(date),
      },
        h('span', { class: 'datetab__day' }, `Day ${i + 1}`),
        h('span', { class: 'datetab__date' }, `${label.month}/${label.day}`),
        h('span', { class: 'datetab__weekday' }, label.weekday),
      )
    );
  });
}

function selectDate(date) {
  state.selectedDate = date;

  for (const btn of el.dateTabs.children) {
    btn.classList.toggle('is-active', btn.dataset.date === date);
  }
  document.querySelector('.datetab.is-active')
    ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });

  renderSelectedDay();
}

function renderSelectedDay() {
  const items = state.byDate.get(state.selectedDate) ?? [];

  renderDayBookings(el.dayBookings, bookingsForDate(state.bookings, state.selectedDate), state.selectedDate);
  renderTimeline(el.timeline, items, state.settings);
  renderDay(items);

  // 하루 전체 길찾기
  const route = dayRouteUrl(items);
  if (route) {
    el.dayRoute.href = route.url;
    el.dayRoute.hidden = false;
    el.dayRouteNote.hidden = route.dropped === 0;
    el.dayRouteNote.textContent = route.dropped
      ? `구글 지도는 경유지를 9곳까지만 받아서 ${route.dropped}곳이 빠졌습니다.`
      : '';
  } else {
    el.dayRoute.hidden = true;
    el.dayRouteNote.hidden = true;
  }

  // 하루 지출
  const costs = items.filter((i) => i.cost !== null).map((i) => i.cost);
  if (costs.length) {
    const total = costs.reduce((a, b) => a + b, 0);
    el.dayTotal.hidden = false;
    el.dayTotal.textContent = `이 날 지출 ${formatMoney(total, state.settings)}`;
  } else {
    el.dayTotal.hidden = true;
  }
}

// ── 전체 렌더 ───────────────────────────────────────────────

function renderAll() {
  const s = state.settings;

  el.tripTitle.textContent = s.title;
  document.title = s.title;
  el.tripSubtitle.textContent = s.subtitle;
  el.tripSubtitle.hidden = !s.subtitle;

  renderPacking(el.packingList, state.packing);
  renderBookingList(el.bookingList, state.bookings, state.settings);
  syncNavVisibility();

  const dates = [...state.byDate.keys()];
  if (!dates.length) {
    showBanner('읽을 수 있는 일정이 없습니다. 일정 탭의 날짜 칸이 채워져 있는지 확인해 주세요.', 'warn');
    clear(el.dateTabs);
    clear(el.timeline);
    return;
  }

  // 여행지 기준 오늘이 일정 안에 있으면 그 날짜를, 아니면 첫날을 선택합니다.
  if (!state.selectedDate || !state.byDate.has(state.selectedDate)) {
    const today = todayInTimezone(s.timezone);
    state.selectedDate = state.byDate.has(today) ? today : dates[0];
  }

  if (!state.mapReady) {
    initMap(
      el.map,
      s.mapCenter ?? CONFIG.defaultMapCenter,
      s.mapZoom ?? CONFIG.defaultMapZoom
    );
    state.mapReady = true;
  }

  renderDateTabs();
  selectDate(state.selectedDate);
  renderBudget(el.budgetView, state.byDate, state.bookings, state.settings);
}

// ── 불러오기 ────────────────────────────────────────────────

function stampUpdatedAt() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  el.updatedAt.textContent = `${hh}:${mm} 기준`;
}

async function load({ silent = false } = {}) {
  if (!silent) el.refreshBtn.classList.add('is-loading');
  el.refreshBtn.disabled = true;

  try {
    const raw = await loadAll();

    const settings = buildSettings(raw.settings);
    state.settings = settings;
    state.byDate = groupByDate(buildItinerary(raw.itinerary, settings));
    state.bookings = buildBookings(raw.bookings);
    state.packing = buildPacking(raw.packing);
    state.lastLoadedAt = Date.now();

    hideBanner();
    renderAll();
    stampUpdatedAt();

    if (raw.source === 'sample') {
      showBanner('예시 데이터를 보고 있습니다. config.js 의 sheetId 에 구글 시트 ID를 넣으면 실제 일정과 연결됩니다.', 'info');
    }
  } catch (err) {
    console.error(err);
    const hasData = state.byDate.size > 0;
    showBanner(
      hasData
        ? `일정을 새로 불러오지 못했습니다. 마지막으로 불러온 내용을 그대로 보여줍니다. (${err.message})`
        : err.message
    );
  } finally {
    el.refreshBtn.classList.remove('is-loading');
    el.refreshBtn.disabled = false;
  }
}

// ── 시작 ───────────────────────────────────────────────────

function boot() {
  cacheElements();

  for (const btn of el.navButtons) {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  }
  el.refreshBtn.addEventListener('click', () => load());

  if (CONFIG.refreshOnFocus) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const elapsed = (Date.now() - state.lastLoadedAt) / 1000;
      if (elapsed >= CONFIG.refreshMinIntervalSec) load({ silent: true });
    });
  }

  setView('itinerary');
  load();
}

boot();
