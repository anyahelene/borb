import { defaultsDeep, assign, get, set } from 'lodash-es';
import { html, render } from 'uhtml';
import { BorbBaseElement } from './BaseElement';
import { sysId, tagName } from './Common';
import Styles, { load } from './Styles';
import { SubSystem } from './SubSystem';

const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;
const previousVersion: typeof _self =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['self']
        : undefined;

export type ConfigDict = { [cfgName: string]: Config };
export type Config = ConfigDict | Config[] | string | number | boolean;
const configs: ConfigDict[] = previousVersion
    ? previousVersion.configs
    : [{}, {}, {}, {}, {}];
export const configNames = ['override', 'session', 'user', 'remote', 'default'];
/**  Convert a settings value to a lowercase string. Any leading or trailing spaces will be stripped. Returns undefined for undefined or null. */
export function toLowerCase(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    return `${value}`.toLowerCase().trim();
}
/** Convert a settings value to boolean. Interprets 'no', 'false', 'disabled' and 'off' as false, everything else based on the truthiness of the value */
export function toBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    else if (typeof value === 'string') {
        const s = value.toLowerCase().trim();
        if (['no', 'false', 'disabled', 'off'].indexOf(s) >= 0) return false;
    }
    return !!value;
}
export function getConfig<T extends string | Config>(
    path: string,
    defaultResult: T,
): T {
    for (const c of configs) {
        const result = get(c, path);
        if (result !== undefined) {
            //if (typeof result === typeof defaultResult)
            return result as T; // TODO: check
        }
    }
    return defaultResult;
}
export function setConfig(config: Config, source: string | number) {
    const src =
        typeof source === 'number' ? source : configNames.indexOf(source);
    if (src >= 0) {
        configs[src] = assign(configs[src], config);
        console.log('setConfig', config, source, '=>', configs[src]);
    }
}

export function saveConfig(source = 'all') {
    try {
        if (source === 'all' || source === 'session') {
            sessionStorage.setItem(
                'turtleduck.sessionConfig',
                JSON.stringify(configs[1]),
            );
        }
    } catch (e) {
        console.error(e);
    }
    try {
        if (source === 'all' || source === 'user') {
            const dict: Config = assign({}, configs[2]);
            delete dict['session'];
            localStorage.setItem('turtleduck.userConfig', JSON.stringify(dict));
        }
    } catch (e) {
        console.error(e);
    }
    try {
        if (source === 'all' || source === 'remote') {
            const dict = assign({}, configs[3]);
            delete dict.session;
            localStorage.setItem(
                'turtleduck.remoteConfig',
                JSON.stringify(dict),
            );
        }
    } catch (e) {
        console.error(e);
    }
}
export function loadConfig() {
    try {
        configs[1] =
            JSON.parse(sessionStorage.getItem('turtleduck.sessionConfig')) ||
            {};
    } catch (e) {
        console.error(e);
    }
    try {
        configs[2] =
            JSON.parse(localStorage.getItem('turtleduck.userConfig')) || {};
    } catch (e) {
        console.error(e);
    }
    try {
        configs[3] =
            JSON.parse(localStorage.getItem('turtleduck.remoteConfig')) || {};
    } catch (e) {
        console.error(e);
    }
}

const saveConfigTimers: { [configName: string]: number } = {};
function autoSaveConfig(source: string) {
    if (saveConfigTimers[source]) {
        clearTimeout(saveConfigTimers[source]);
    }
    saveConfigTimers[source] = window.setTimeout(() => {
        console.log('autosaved config ', source);
        saveConfig(source);
        delete saveConfigTimers[source];
    }, 3000);
}
function storageAvailable(type: string) {
    let storage: Storage;
    try {
        storage =
            type === 'local' ? window.localStorage : window.sessionStorage;
        const x = '__storage_test__';
        storage.setItem(x, x);
        storage.removeItem(x);
        return true;
    } catch (e) {
        return (
            e instanceof DOMException &&
            // everything except Firefox
            (e.code === 22 ||
                // Firefox
                e.code === 1014 ||
                // test name field too, because code might not be present
                // everything except Firefox
                e.name === 'QuotaExceededError' ||
                // Firefox
                e.name === 'NS_ERROR_DOM_QUOTA_REACHED') &&
            // acknowledge QuotaExceededError only if there's something already stored
            storage &&
            storage.length !== 0
        );
    }
}

export const hasLocalStorage = storageAvailable('localStorage');
export const hasSessionStorage = storageAvailable('sessionStorage');
export const localStorage = storageAvailable('localStorage')
    ? window.localStorage
    : {
          dict: {} as { [key: string]: any },

          getItem(key: string) {
              return this.dict[key];
          },

          setItem(key: string, value: any) {
              this.dict[key] = value;
          },
          removeItem(key: string) {
              delete this.dict[key];
          },
      };

export const sessionStorage = storageAvailable('sessionStorage')
    ? window.sessionStorage
    : {
          dict: {} as { [key: string]: any },
          getItem(key: string) {
              return this.dict[key];
          },
          setItem(key: string, value: string) {
              this.dict[key] = value;
          },
          removeItem(key: string) {
              delete this.dict[key];
          },
      };
class BorbSettings extends BorbBaseElement {
    static tag = tagName('settings', revision);
    private _observer: MutationObserver = new MutationObserver((muts) =>
        this.queueUpdate(true),
    );

    constructor() {
        super(['css/common.css']);
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.isConnected) {
            if (!this.shadowRoot) {
                this.attachShadow({ mode: 'open' });
            }
            console.log(
                'element added to page.',
                this,
                this.isConnected,
                this.shadowRoot,
            );
            this._observer.observe(this, {
                childList: true,
                attributeFilter: [],
            });
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._observer.disconnect();
        // DragNDrop.detachDropZone(this._header);
        console.log('removed from page.', this);
    }

    update() {
        render(
            this.shadowRoot,
            html`${this.styles}
                <pre>${JSON.stringify(configs, null, 4)}</pre>`,
        );
    }
}

const _self = {
    _id: sysId(import.meta.url),
    _revision: revision,
    getConfig,
    setConfig,
    saveConfig,
    loadConfig,
    localStorage,
    sessionStorage,
    autoSaveConfig,
    configs,
    toBoolean,
    toLowerCase,
};

export const Settings = SubSystem.declare(_self)
.reloadable(true)
.depends()
.elements(BorbSettings)
.start(() => loadConfig())
.register();

export default Settings;

if (import.meta.webpackHot) {
    import.meta.webpackHot.accept();
    import.meta.webpackHot.addDisposeHandler((data) => {
        console.warn(`Unloading ${_self._id}`);
        data['revision'] = revision;
        data['self'] = _self;
    });
}
