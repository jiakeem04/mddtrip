// style.css 의 토큰을 읽어 실제로 쓰이는 글자/배경 조합의 명암비를 계산합니다.
// WCAG AA: 본문 4.5:1, 큰 글씨(18.66px+ 또는 14pt bold) 3:1
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../assets/style.css', import.meta.url), 'utf8');

function tokensIn(block) {
  const map = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
    map[name] = value;
  }
  return map;
}

// :root { ... } 첫 블록 = 라이트
const lightBlock = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
// 다크 블록
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const darkBlock = css.slice(darkStart, css.indexOf('/* 카테고리 색'));

const light = tokensIn(lightBlock);
const dark = { ...light, ...tokensIn(darkBlock) };

function lum(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// [설명, 글자토큰, 배경토큰, 필요대비]
const CHECKS = [
  ['본문 글자 / 카드',            '--text',      '--surface',   4.5],
  ['보조 글자 / 카드',            '--text-dim',  '--surface',   4.5],
  ['흐린 글자 / 카드',            '--text-faint','--surface',   4.5],
  ['보조 글자 / 페이지배경',      '--text-dim',  '--bg',        4.5],
  ['흐린 글자 / 페이지배경',      '--text-faint','--bg',        4.5],
  ['버튼 글자 / 버튼배경',        '--text-dim',  '--surface-2', 4.5],
  ['강조색 글자 / 카드',          '--accent',    '--surface',   4.5],
  ['강조색 글자 / 강조배너',      '--accent-ink','--accent-soft', 4.5],
  ['날짜탭·기본버튼 글자',        '--on-color',  '--accent',    4.5],
];

const KINDS = ['--c-blue', '--c-amber', '--c-teal', '--c-pink', '--c-purple', '--c-slate'];

let fail = 0;
for (const [modeName, T] of [['라이트', light], ['다크', dark]]) {
  console.log(`\n════ ${modeName} 모드 ════`);
  const line = (label, fg, bg, need) => {
    const r = ratio(T[fg], T[bg]);
    const ok = r >= need;
    if (!ok) fail++;
    console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(24)} ${r.toFixed(2).padStart(5)}:1  (필요 ${need})  ${T[fg]} on ${T[bg]}`);
  };

  for (const [label, fg, bg, need] of CHECKS) line(label, fg, bg, need);

  console.log('  ── 카테고리 색 (시각 텍스트로 쓰임)');
  for (const k of KINDS) line(k.replace('--c-', '') + ' / 카드', k, '--surface', 4.5);

  console.log('  ── 카테고리 원 안 숫자');
  for (const k of KINDS) line(k.replace('--c-', '') + ' 원 숫자', '--on-color', k, 4.5);
}

console.log(`\n${'─'.repeat(50)}\n기준 미달 ${fail}건`);
process.exit(fail ? 1 : 0);
