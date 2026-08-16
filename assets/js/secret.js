import { h, clear } from './dom.js';

/**
 * 비밀번호로 잠긴 링크.
 *
 * 시트에는 URL 대신 `secret:<암호문>` 만 들어갑니다. 암호문은 AES-GCM 으로 잠겨 있고
 * 열쇠는 비밀번호에서 PBKDF2 로 만들어내므로, 비밀번호 없이는 URL을 복원할 수 없습니다.
 * 페이지 소스를 봐도 암호문뿐입니다.
 *
 * 한계: 비밀번호가 짧으면 공격자가 오프라인에서 하나씩 대입해 볼 수 있습니다.
 * 지인끼리 우연한 노출을 막는 용도이지, 강한 보안이 아닙니다.
 */

const ITERATIONS = 250000; // tools/encrypt-link.mjs 와 반드시 같아야 합니다

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function decryptSecret(blob, password) {
  const raw = fromBase64Url(blob);
  const salt = raw.slice(0, 16);
  const iv = raw.slice(16, 28);
  const data = raw.slice(28);

  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // AES-GCM 은 위변조를 검사하므로, 비밀번호가 틀리면 여기서 예외가 납니다.
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}

// 한 번 푼 링크는 탭이 열려 있는 동안만 기억합니다. 창을 닫으면 사라집니다.
const cache = new Map();

let dialog = null;

function ensureDialog() {
  if (dialog) return dialog;

  dialog = h('dialog', { class: 'lockbox' });
  document.body.append(dialog);

  // 배경을 누르면 닫히도록
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  return dialog;
}

function renderUnlocked(box, url, label) {
  clear(box);
  box.append(
    h('h2', { class: 'lockbox__title' }, '🔓 ', label),
    h('p', { class: 'lockbox__hint' }, '아래 버튼을 누르면 새 탭에서 열립니다.'),
    h('a', {
      class: 'btn btn--primary lockbox__open',
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, '링크 열기'),
    h('button', { class: 'btn lockbox__close', type: 'button', onclick: () => dialog.close() }, '닫기'),
  );
}

/** 잠긴 링크를 여는 대화상자. 이미 푼 적이 있으면 비밀번호를 다시 묻지 않습니다. */
export function openSecretDialog(blob, label = '잠긴 링크') {
  const box = ensureDialog();
  clear(box);

  if (cache.has(blob)) {
    renderUnlocked(box, cache.get(blob), label);
    box.showModal();
    return;
  }

  const input = h('input', {
    class: 'lockbox__input',
    type: 'password',
    placeholder: '비밀번호',
    autocomplete: 'off',
  });
  const error = h('p', { class: 'lockbox__error' });
  error.hidden = true;

  const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, '열기');

  const tryUnlock = async (event) => {
    event.preventDefault();
    const password = input.value;
    if (!password) return;

    submit.disabled = true;
    submit.textContent = '확인 중…';
    error.hidden = true;

    try {
      const url = await decryptSecret(blob, password);
      cache.set(blob, url);
      renderUnlocked(box, url, label);
    } catch {
      error.textContent = '비밀번호가 맞지 않습니다.';
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = '열기';
      input.select();
    }
  };

  const form = h('form', { class: 'lockbox__form', onsubmit: tryUnlock },
    h('h2', { class: 'lockbox__title' }, '🔒 ', label),
    h('p', { class: 'lockbox__hint' }, '개인 정보가 담긴 링크입니다. 비밀번호를 입력해 주세요.'),
    input,
    error,
    h('div', { class: 'lockbox__actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => box.close() }, '취소'),
      submit,
    ),
  );

  box.append(form);
  box.showModal();
  input.focus();
}

/** 이 브라우저에서 잠긴 링크를 풀 수 있는지 (https 또는 localhost 여야 합니다) */
export function canUnlock() {
  return Boolean(globalThis.crypto?.subtle);
}
