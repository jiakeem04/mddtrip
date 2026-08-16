// 아주 작은 DOM 헬퍼. createElement 기반이라 문자열 이스케이프를 신경 쓸 필요가 없습니다.

export function h(tag, props, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') node.setAttribute('style', value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : value);
  }

  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
}

/** 새 창에서 여는 링크. 구글 지도로 나가는 버튼에 씁니다. */
export function extLink(href, className, ...children) {
  return h('a', { href, class: className, target: '_blank', rel: 'noopener noreferrer' }, ...children);
}
