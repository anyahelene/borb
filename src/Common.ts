export class BorbElement extends HTMLElement {
  static tag: string;
  constructor() {
    super();
  }
}

export const prefix = 'borb-';
export function tagName(name: string, revision: number = 0) {
  const suffix = revision > 0 ? `_${revision}` : '';
  return `${prefix}${name}${suffix}`;
}
export function previousTagName(name: string) {
  const m = name.match(/^(.*)_([0-9]+)$/);
  if (m) {
    const rev = parseInt(m[2]);
    if (rev === 1) {
      return m[1];
    } else {
      return `${m[1]}_${rev - 1}`;
    }
  }
}

export function assert<T>(
  cond: T | (() => T),
  recover: (() => void) | any,
  ...args: any[]
): T {
  if (typeof cond === 'function') {
    cond = (cond as () => T)();
  }
  if (typeof recover !== 'function') {
    args = [recover, ...args];
    recover = undefined;
  }
  if (!cond) {
    console.error('Assertion failed: ', ...args);
    if (recover) {
      try {
        recover();
      } catch (e) {
        console.error('   also, recovery function failed: ', e);
      }
    }
  }
  return cond;
}

export function upgradeElements(eltDef: typeof BorbElement) {
  const previousTag = previousTagName(eltDef.tag);
  if (!previousTag) return;
  for (const oldElt of document.getElementsByTagName(previousTag)) {
    const newElt = new eltDef();
    console.log('upgrading', oldElt, 'to', newElt);
    oldElt.getAttributeNames().forEach((attrName) => {
      console.log('set', attrName, oldElt.getAttribute(attrName));
      newElt.setAttribute(attrName, oldElt.getAttribute(attrName));
    });
    newElt.replaceChildren(...oldElt.childNodes);
    console.log('replacedChildren:', newElt.children);
    oldElt.parentElement.replaceChild(newElt, oldElt);
  }
}

let unique = 0;

/**
 * Generate unique id
 * @param strOrElts list of elements that need ids
 * @return the base prefix, or a fresh unique id if elts is empty
 */
export function uniqueId(...strOrElts: (Element | string)[]): string {
  let prefix = '_';
  if (
    typeof strOrElts[0] === 'string' &&
    typeof strOrElts[1] in ['undefined', 'string']
  ) {
    prefix = strOrElts.shift() as string;
  }
  let suffix = '_';
  for (const elt of strOrElts) {
    if (typeof elt === 'string') {
      suffix = elt;
    } else if (elt && !elt.id) {
      elt.id = `${prefix}${suffix}${unique++}`;
    }
  }
  return `${prefix}${suffix}${unique++}`;
}

let keyhandler: (
  key: string,
  button?: HTMLElement,
  event?: Event,
) => Promise<any> = (key) => Promise.resolve();
export function setKeyHandler(
  handler: (key: string, button?: HTMLElement, event?: Event) => Promise<any>,
) {
  keyhandler = handler;
}

export function handleKey(
  key: string,
  button?: HTMLElement,
  event?: Event,
): Promise<any> {
  return keyhandler(key, button, event);
}
