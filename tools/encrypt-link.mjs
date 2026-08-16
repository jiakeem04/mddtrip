#!/usr/bin/env node
/**
 * 링크를 비밀번호로 암호화해, 시트에 넣을 `secret:...` 토큰을 만듭니다.
 *
 *   echo "https://예약링크..." | node tools/encrypt-link.mjs --password "비밀번호"
 *   node tools/encrypt-link.mjs --url "https://..." --password "비밀번호"
 *
 * 출력된 `secret:...` 한 줄을 시트의 「관련 링크」 칸에 넣고,
 * 원래 URL은 시트에서 반드시 지우세요. 시트는 공개라 지우지 않으면 의미가 없습니다.
 *
 * 복호화는 브라우저에서 assets/js/secret.js 가 합니다. 두 파일의 ITERATIONS 는 같아야 합니다.
 */

const ITERATIONS = 250000;

const argOf = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
};

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8').trim();
}

const password = argOf('password');
if (!password) {
  console.error('사용법: node tools/encrypt-link.mjs --password "비밀번호" [--url "https://..."]');
  process.exit(1);
}

const url = argOf('url') ?? (await readStdin());
if (!url) {
  console.error('암호화할 URL이 없습니다. --url 로 주거나 표준입력으로 넣어주세요.');
  process.exit(1);
}

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));

const keyMaterial = await crypto.subtle.importKey(
  'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  keyMaterial,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt']
);
const ciphertext = new Uint8Array(
  await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(url))
);

// salt(16) + iv(12) + 암호문 을 이어붙여 한 덩어리로 만듭니다.
const blob = Buffer.concat([
  Buffer.from(salt), Buffer.from(iv), Buffer.from(ciphertext),
]).toString('base64url');

console.log(`secret:${blob}`);
