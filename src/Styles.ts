/// <reference types="webpack/module" />

import { sysId } from './Common';
import SubSystem from './SubSystem';

const subsys_name = 'Styles';
const revision: number =
  import.meta.webpackHot && import.meta.webpackHot.data
    ? (import.meta.webpackHot.data['revision'] || 0) + 1
    : 0;
const previousVersion: typeof _self =
  import.meta.webpackHot && import.meta.webpackHot.data
    ? import.meta.webpackHot.data['self']
    : undefined;

interface StylesData {
  styles: Map<string, string>;
  styleNodes: Map<string, HTMLStyleElement>;
  styleStatus: Map<string, string>;
  styleClones: Map<string, Map<HTMLElement, HTMLStyleElement>>;
}
export const data: StylesData = previousVersion
  ? { ...previousVersion.data }
  : {
      styles: new Map<string, string>(),
      styleNodes: new Map<string, HTMLStyleElement>(),
      styleStatus: new Map<string, string>(),
      styleClones: new Map<string, Map<HTMLElement, HTMLStyleElement>>(),
    };
export function attach(name: string, listener: (ev: Event) => void): void {
  let node = data.styleNodes.get(name);
  if (!node) {
    node = load(name);
  }
  node.addEventListener('change', listener);
}
export function detach(name: string, listener: (ev: Event) => void): void {
  let node = data.styleNodes.get(name);
  if (!node) {
    node = load(name);
  }
  node.removeEventListener('change', listener);
}
/**
 * Get a stylesheet, loading it if necessary.
 *
 * Returns immediately with the style element associated with *name*.
 *
 * Attach a *change* event listener to the returned node to be notified when the
 * stylesheet is loaded or updated.
 *
 *
 * @param name name/path/url of the stylesheet
 * @returns The associated STYLE element
 */
export function get(name: string, defaultStyles?: string): HTMLStyleElement {
  let node = data.styleNodes.get(name);
  if (!node) {
    node = load(name, false, defaultStyles);
  }
  return node.cloneNode(true) as HTMLStyleElement;
}
export function getStyleFor(
  elt: HTMLElement,
  name: string,
  defaultStyles?: string,
): HTMLStyleElement {
  let clones = data.styleClones.get(name);
  if (!clones) {
    clones = new Map<HTMLElement, HTMLStyleElement>();
    data.styleClones.set(name, clones);
  }
  let clone = clones.get(elt);
  if (!clone) {
    clone = get(name, defaultStyles);
    clones.set(elt, clone);
  }
  console.log('getting style %s for %o: %o', name, elt, clone);
  return clone;
}
export function disposeStyle(elt: HTMLElement, name: string): HTMLStyleElement {
  let clones = data.styleClones.get(name);
  if (clones) {
    console.log('disposing of style %s for %o: %o', name, elt, clones.get(elt));
    clones.delete(elt);
    if (clones.size === 0) {
      data.styleClones.delete(name);
    }
  }
  return null;
}

export function refreshClones(name: string, node: HTMLStyleElement) {
  let clones = data.styleClones.get(name);
  if (clones) {
    clones.forEach((clone, elt) => {
      console.log(
        'updating style %s for %o, style element %o',
        name,
        elt,
        clone,
      );
      clone.textContent = node.textContent;
    });
  }
}
/**
 * (Re)load a stylesheet.
 *
 * Returns immediately with the style element associated with *name*.
 * The stylesheet is loaded in the background with *fetch()*, will
 * trigger a *change* event on the style element when loading is complete.
 * Will not trigger a new *fetch()* if one is already in progress.
 *
 * The style element should be cloned before inserting it into the DOM; make a fresh clone on each change.
 *
 * @param name name/path/url of the stylesheet
 * @returns The associated STYLE element
 */
export function load(
  name: string,
  bypassCache = false,
  defaultStyles?: string,
): HTMLStyleElement {
  let node = data.styleNodes.get(name);
  if (!node) {
    node = document.createElement('style');
    node.textContent = defaultStyles ?? '* { display: none}';
    data.styleNodes.set(name, node);
  }

  if (data.styleStatus.get(name) === 'pending') {
    return node;
  }
  data.styleStatus.set(name, 'pending');
  const headers = new Headers();
  headers.append('accept', 'text/css');
  if (bypassCache) {
    headers.append('pragma', 'no-cache');
    headers.append('cache-control', 'no-cache');
  }
  fetch(name, {
    method: 'GET',
    headers,
  })
    .then(async (resp) => {
      if (resp.ok) {
        const txt = await resp.text();
        data.styles.set(name, txt);
        data.styleStatus.set(name, 'loaded');
        node.textContent = txt;
        refreshClones(name, node);
        node.dispatchEvent(new Event('change'));
      } else {
        console.warn(`Fetching '${name}': `, resp.status, resp.statusText);
        data.styleStatus.set(name, 'error');
      }
    })
    .catch((reason) => {
      data.styleStatus.set(name, 'error');
      console.error(`Fetching '${name}': `, name, reason);
    });

  return node;
}
/**
 * (Re)load a stylesheet.
 *
 * Returns immediately with the style element associated with *name*.
 * The stylesheet is loaded in the background with *fetch()*, will
 * trigger a *change* event on the style element when loading is complete.
 * Will not trigger a new *fetch()* if one is already in progress.
 *
 * @param name name/path/url of the stylesheet
 * @returns The associated STYLE element
 */
export function update(name: string): void {
  console.log('updating stylesheet', name);
  load(name, true);
}
const _self = {
  _id: sysId(import.meta.url),
  _revision: revision,
  get,
  getStyleFor,
  disposeStyle,
  update,
  load,
  attach,
  detach,
  data,
  version: 7,
};

export const Styles = _self;
export default Styles;

SubSystem.declare(_self).register();

console.warn('Styles *loaded*!!!!');

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept();
  import.meta.webpackHot.addDisposeHandler((d: StylesData) => {
    d.styles = data.styles;
    d.styleNodes = data.styleNodes;
    d.styleStatus = data.styleStatus;
  });
}
