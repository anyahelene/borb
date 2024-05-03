import Systems from './SubSystem';
import { sysId, tagName, uniqueId } from './Common';
import { BorbBaseElement } from './BaseElement';
import { html, render } from 'uhtml';
import Styles from './Styles';
import { Settings } from './Settings';
import LineEditors, { LineEditor } from './LineEditor';
import { Frames, BorbFrame } from './Frames';

const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;
const previousVersion: typeof _self =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['self']
        : undefined;
const styleRef = 'css/sheet.css';

const EMPTY_ELEMENT = document.createElement('td');
function nthColumn(row: Element, n: number) {
    return row.querySelector(`td:nth-of-type(${n})`);
}
export class BorbSheet extends BorbBaseElement {
    static tag = tagName('sheet', revision);

    private _observer: MutationObserver = new MutationObserver((muts) =>
        this.queueUpdate(true),
    );
    private _keydownListener = (ev: KeyboardEvent) => {};
    private _tableElt: HTMLTableElement;
    private _headElt: HTMLTableRowElement;
    private _footElt: HTMLTableRowElement;
    private _children: HTMLTableRowElement[];
    private _sortHandler: (ev: MouseEvent) => void;
    private _abortCtrl: AbortController;
    constructor() {
        super(['css/common.css']);
        this._tableElt = document.createElement('table');
        this._sortHandler = (ev: MouseEvent) => {
            console.log('sort clicked:', ev.target, ev.currentTarget);
            if (ev.currentTarget instanceof HTMLElement)
                this._sort(ev.currentTarget);
        };
    }

    _sort(th: HTMLElement) {
        console.log(th);
        let sorting = 0;
        const type = th.dataset.type || 'string';
        const desc = th.classList.contains('sort-desc'),
            asc = th.classList.contains('sort-asc');
        this.querySelectorAll('thead th').forEach((elt) =>
            elt.classList.remove('sort-desc', 'sort-asc'),
        );
        if (desc) {
            th.classList.add('sort-asc');
            sorting = 1;
        } else {
            th.classList.add('sort-desc');
            sorting = -1;
        }
        const idx = parseInt(th.dataset.index);
        const body = this.querySelector(':scope > tbody') as HTMLElement;
        console.log(idx, body);
        if (body) {
            const rows = Array.from(body.children);
            rows.sort((a, b) => {
                const aCol = nthColumn(a, idx).textContent || '';
                const bCol = nthColumn(b, idx).textContent || '';
                if (type === 'number' || type === 'int' || type === 'float') {
                    return sorting * (parseFloat(aCol) - parseFloat(bCol));
                } else {
                    return sorting * aCol.localeCompare(bCol);
                }
            });
            body.replaceChildren(...rows);
        }
    }
    get tableElement(): HTMLTableElement {
        return this._tableElt;
    }
    connectedCallback() {
        super.connectedCallback();
        if (this.isConnected) {
            console.log('connected', this.tagName, this);
            if (!this.shadowRoot) {
                console.log('creating shadow root');
                this.attachShadow({ mode: 'open' });
            }
            console.log('element added to page.', this);
            this._observer.observe(this, {
                childList: true,
            });
            this.queueUpdate();
        }
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this._observer.disconnect();
        console.log('removed from page.', this);
    }

    update() {
        if (this.isConnected && this.shadowRoot) {
            if (this._abortCtrl) {
                this._abortCtrl.abort();
                this._abortCtrl = undefined;
            }
            const head = this.querySelector(':scope > thead');
            if (head) {
                this._abortCtrl = new AbortController();
                head.querySelectorAll(':scope th').forEach(
                    (th: HTMLElement, i) => {
                        th.dataset.index = `${i + 1}`;
                        if (!th.classList.contains('no-sort'))
                            th.addEventListener('click', this._sortHandler, {
                                signal: this._abortCtrl.signal,
                            });
                    },
                );
            }
            render(
                this.shadowRoot,
                html`${this.styles}
                    <table>
                        ${this._headElt ? this._headElt : ''}
                        <slot></slot>
                        ${this._headElt ? this._headElt : ''}
                    </table>`,
            );
        }
    }
    focus(options?: FocusOptions) {
        super.focus(options);
        // TODO: perhaps focus on last selected cell?
        console.log('sheet focus', this);
    }
    ensureId() {
        if (!this.id) uniqueId('sheet', this);
        return this.id;
    }
    scrollToBottom() {
        this._headElt?.scrollIntoView();
    }
}

const _self = {
    _id: sysId(import.meta.url),
    _revision: revision,
    BorbSheet,
    Frames,
};

export const Sheet = Systems.declare(_self)
    .reloadable(true)
    .depends('dom', Styles)
    .elements(BorbSheet)
    .register();
console.warn('Sheet', Sheet);
export default Sheet;

if (import.meta.webpackHot) {
    import.meta.webpackHot.accept();
    import.meta.webpackHot.addDisposeHandler((data) => {
        console.warn(`Unloading ${_self._id}`);
        data['revision'] = revision;
        data['self'] = _self;
    });
}
