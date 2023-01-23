import { Borb } from '.';
import type { BorbContainer, BorbElement } from './BaseElement';

export const borbName = 'borb';

export const borbPrefix = `${borbName}-`;

export function tagName(name: string, revision = 0): string {
    const suffix = revision > 0 ? `_${revision}` : '';
    return `${borbPrefix}${name}${suffix}`;
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

export function sysId(url: string) {
    return `${borbName}/${url.match(/(\w+)\.ts/)[1].toLowerCase()}`;
}
export function assert<T>(
    cond: T | ((...args: unknown[]) => T),
    recover: (() => void) | unknown,
    ...args: unknown[]
): T {
    if (typeof recover !== 'function') {
        args = [recover, ...args];
        recover = undefined;
    }
    if (typeof cond === 'function') {
        cond = (cond as (...args: unknown[]) => T)(...args);
    }
    if (!cond) {
        console.error('Assertion failed: ', ...args);
        if (typeof recover === 'function') {
            try {
                recover();
            } catch (e) {
                console.error('   also, recovery function failed: ', e);
            }
        }
    }
    return cond;
}

const frameTag = tagName('frame').toUpperCase();
export function isFrame(elt: HTMLElement | BorbContainer): elt is BorbContainer {
    return elt && elt.tagName.startsWith(frameTag);
}
let unique = 0;

/**
 * Generate unique id
 * @param strOrElts list of elements that need ids
 * @return the base prefix, or a fresh unique id if elts is empty
 */
export function uniqueId(...strOrElts: (Element | string)[]): string {
    let prefix = '_';
    if (typeof strOrElts[0] === 'string' && typeof strOrElts[1] in ['undefined', 'string']) {
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
export function uniqueIdNumber(): number {
    return unique++;
}
let keyhandler: (key: string, button?: HTMLElement, event?: Event) => Promise<unknown> = (key) =>
    Promise.resolve();
export function setKeyHandler(
    handler: (key: string, button?: HTMLElement, event?: Event) => Promise<unknown>,
) {
    keyhandler = handler;
}

export function handleKey(key: string, button?: HTMLElement, event?: Event): Promise<unknown> {
    return keyhandler(key, button, event);
}

export function upgradeElements(eltDef: typeof BorbElement) {
    const previousTag = previousTagName(eltDef.tag);
    if (!previousTag) return;
    console.log('UPGRADING', document.getElementsByTagName(previousTag));
    for (const oldElt of [...document.getElementsByTagName(previousTag)]) {
        const newElt = new eltDef();
        console.log('upgrading', oldElt, 'to', newElt);
        oldElt.getAttributeNames().forEach((attrName) => {
            console.log('set', attrName, oldElt.getAttribute(attrName));
            newElt.setAttribute(attrName, oldElt.getAttribute(attrName));
        });
        newElt.replaceChildren(...oldElt.childNodes);
        console.log('replacedChildren:', newElt.children);
        if (typeof newElt['upgrade'] == 'function') {
            newElt['upgrade'].bind(newElt)(oldElt);
        }
        oldElt.parentElement.replaceChild(newElt, oldElt);
    }
}

export function interpolate(s: string, data: { [attr: string]: string }) {
    const props = new Set<string>(Object.keys(data));
    let result = '';
    for (;;) {
        const m = s.match(/^(.*?)\${(?:{(.*?)})?([a-z0-9-]*)(?:{(.*?)})?}(.*)$/);

        if (m) {
            result = result + m[1];
            s = m[5];
            const prefix = m[2] ?? '';
            const attr = m[3];
            const suffix = m[4] ?? '';
            if (props.has(attr) && data[attr]) {
                result = result + prefix + data[attr] + suffix;
            }
        } else {
            return result + s;
        }
    }
}

export function isPromise(obj: any | Promise<any>): obj is Promise<any> {
    return typeof obj?.['then'] === 'function';
}

export class Cancelled extends Error {
    constructor(message: string) {
        super(message);
    }
}
