/// <reference types="webpack/module" />

import SubSystem from './SubSystem';

const subsys_name = 'Styles';
const revision: number =
  import.meta.webpackHot && import.meta.webpackHot.data
    ? (import.meta.webpackHot.data['revision'] || 0) + 1
    : 0;
const previousVersion: typeof self =
  import.meta.webpackHot && import.meta.webpackHot.data
    ? import.meta.webpackHot.data['self']
    : undefined;

interface StylesData {
  styles: Map<string, string>;
  styleNodes: Map<string, HTMLStyleElement>;
  styleStatus: Map<string, string>;
}
export const data: StylesData = previousVersion
  ? { ...previousVersion.data }
  : {
      styles: new Map<string, string>(),
      styleNodes: new Map<string, HTMLStyleElement>(),
      styleStatus: new Map<string, string>(),
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
 * The style element should be cloned before inserting it into the DOM; make a fresh clone on each change.
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
const self = { get, update, load, attach, detach, data, version: 7 };

export const Styles = self;
export default Styles;

SubSystem.declare(`borb/${subsys_name.toLowerCase()}`, self, revision)
  .start((self, dep) => {})
  .register();

console.warn('Styles *loaded*!!!!');

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept();
  import.meta.webpackHot.addDisposeHandler((d: StylesData) => {
    d.styles = data.styles;
    d.styleNodes = data.styleNodes;
    d.styleStatus = data.styleStatus;
  });
}
