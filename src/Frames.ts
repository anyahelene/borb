import Systems from './SubSystem';
import { html, render } from 'uhtml';
import { tagName, assert, uniqueId, sysId, interpolate } from './Common';
import { BorbBaseElement, BorbElement } from './BaseElement';
import { isEqual } from 'lodash-es';
import { DragNDrop, BorbDragEvent } from './DragNDrop';
import Styles from './Styles';

declare module './SubSystem' {
    interface BorbSys {
        frames: typeof Frames;
    }
}

//import 'css/frames.css';

const styleRef = 'css/frames.css';

const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;

export class BorbPanel extends HTMLElement {
    static tag = tagName('panel', revision);
}
export class BorbTab extends BorbElement {
    static tag = tagName('tab', revision);
    _target?: HTMLElement;
    get targetElement(): HTMLElement {
        if (!this._target) this.connectedCallback();
        return this._target;
    }
    get target(): string {
        return this.getAttribute('target');
    }
    set target(tgt: string) {
        this.setAttribute('target', tgt);
        this._target = undefined;
    }
    connectedCallback() {
        this._target = document.getElementById(this.target);
    }

    disconnectedCallback() {
        this._target = undefined;
    }

    adoptedCallback() {
        this.connectedCallback();
    }
}

const dragImage = new Image(1, 1);
dragImage.src =
    'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
dragImage.style.userSelect = 'none';
dragImage.style.opacity = '0.1';
dragImage.style.background = 'none';

//const dragImage = (html.node`<img width="0" height="0" style="background:green!important;opacity:0%" id="transparent-pixel" src="">`;

const nameAttrs = new Map<string, string[]>([
    ['tab-title', ['tab-title', 'data-tab-title', 'frame-title', 'data-title', 'data-frame-title']],
    ['title-left', ['title-left']],
    ['title-right', ['title-right', 'status']],
    ['title-mid', ['title-mid']],
    ['icon', ['icon', 'data-icon']],
    ['tab-class', ['tab-class', 'data-tab-class']],
]);
class TabEntry extends HTMLButtonElement {
    nameAttrList = [...nameAttrs.values()].flat();
    static tag = tagName('tab-button-internal', revision);
    element: HTMLElement;
    observer: MutationObserver;
    frame: BorbFrame;
    titleAttrs: { [attr: string]: string };
    titleElts = {
        left: html.node`<span class="title-left></span>"`,
        mid: html.node`<span class="title-mid"></span>`,
        right: html.node`<span class="title-right"></span>`,
    };
    tabName: string;
    _hidden: boolean;
    constructor() {
        super();
    }

    init(elt: HTMLElement, frame: BorbFrame): this {
        if (!elt.id) elt.id = uniqueId();
        this.element = elt;
        this.frame = frame;
        this.draggable = true;
        this.setAttribute('role', 'tab');
        this.setAttribute('aria-controls', this.panel.id ?? '');
        this.dataset.drop = 'true';
        this.type = 'button';
        this.observer = new MutationObserver(() => {
            this._getTitleAttrs();
            this.update();
        });
        this.observer.observe(this.element, {
            attributeFilter: this.nameAttrList,
        });
        this.element.slot = this.frame.classList.contains('no-tabs') ? '' : this.element.id;
        if (!this.panel.hasAttribute('role')) {
            this.panel.setAttribute('role', 'tabpanel');
        }
        this.addEventListener('click', this.select); // safe since 'click' is dispatched on 'this'
        DragNDrop.attachDraggable(this);
        this._getTitleAttrs();
        this.update();
        return this;
    }
    canDropTo(dest: BorbFrame): boolean {
        if (this.frame === dest)
            // can always move within frame
            return true;
        if (
            dest.classList.contains('no-tabs') || // dest doesn't accept tabs
            this.element !== this.panel
        )
            // tab can't leave frame
            return false;
        return true;
    }
    get panel() {
        if ((this.element as BorbTab).targetElement) {
            return (this.element as BorbTab).targetElement;
        } else {
            return this.element;
        }
    }
    dispose() {
        DragNDrop.detachDraggable(this);
        this.removeEventListener('click', this.select);
        this.remove();
        this.observer.disconnect();
    }
    nextTabEntryElement() {
        const next = this.nextElementSibling;
        if (next instanceof TabEntry) {
            return next.element;
        } else {
            return undefined;
        }
    }
    get hidden(): boolean {
        this._hidden = this.element.hidden || !this.titleAttrs['tab-title'];
        return this._hidden;
    }

    _getTitleAttrs(): void {
        this.titleAttrs = {};
        nameAttrs.forEach((attrs, key) => {
            for (const attr of attrs) {
                if (this.element.hasAttribute(attr)) {
                    this.titleAttrs[key] = this.element.getAttribute(attr);
                    break;
                }
            }
        });
        this.tabName = this.titleAttrs['tab-title'] ?? this.id;
        this.titleElts.left.innerText = this.titleAttrs['title-left'] ?? '';
        this.titleElts.mid.innerText = this.titleAttrs['title-mid'] ?? '';
        this.titleElts.right.innerText = this.titleAttrs['title-right'] ?? '';
        if (this.titleAttrs['tab-class'] !== undefined) {
            this.className = this.titleAttrs['tab-class'];
        }
    }

    select() {
        console.warn('select', this);
        const old = this.frame.selected;
        this.frame.selected = this;
        if (old !== this) this.frame.tabTransition();
        this.frame.queueUpdate();
        queueMicrotask(() => {
            // this.frame._focusin(undefined);
            this.panel.focus();
        });
    }
    selected(isSelected: boolean) {
        this.setAttribute('aria-selected', String(isSelected));
        if (isSelected) {
            this.element.setAttribute('aria-current', 'true');
            this.element.removeAttribute('aria-hidden');
        } else {
            this.element.setAttribute('aria-hidden', 'true');
            this.element.removeAttribute('aria-current');
        }
    }
    get slotId(): string {
        return this.element.slot;
    }

    update() {
        const hidden = this._hidden;
        render(
            this,
            html`${this.titleAttrs['icon']
                    ? html`<span class="icon">${this.titleAttrs['icon']}</span>`
                    : ''}<span>${this.titleAttrs['tab-title']}</span>`,
        );
        if (hidden != this.hidden) this.frame.queueUpdate(true);
    }

    isLeftOf(other: HTMLElement): boolean {
        return this.parentElement === other.parentElement && this.offsetLeft < other.offsetLeft;
    }

    get tag() {
        return TabEntry.tag;
    }
}

export class BorbFrame extends BorbBaseElement {
    static tag = tagName('frame', revision);
    static currentFocus: HTMLElement;
    static lastFocus: HTMLElement;
    static _debug = false;
    public selected?: TabEntry;
    private _tabs: Map<Element, TabEntry> = new Map();
    private _nav: HTMLElement;
    private _observer: MutationObserver;
    // private _style: HTMLStyleElement;
    // private _styleChangedHandler = (ev: Event) => this.styleChanged();
    private _header: HTMLElement;
    private _overlay: HTMLElement;
    constructor() {
        super(['css/common.css', styleRef]);
        // this._style = Styles.get(styleRef);
        this._observer = new MutationObserver((muts) => this.queueUpdate(true));
        this._nav = html.node`<nav class="tabs" role="tablist"></nav>`;
        const maxIcon = '🗖'; // '🗗'
        const minIcon = '🗕';
        this._header = html.node`<header>${this._nav}<h1 draggable="true"></h1>
            <nav class="window-tools"><button class="min-button">${minIcon}</button><button class="max-button">${maxIcon}</button></nav></header>`;
        this._overlay = document.createElement('div');
        this._overlay.classList.add('overlay');
        this._overlay.style.position = 'absolute';
        this._overlay.style.opacity = '0%';
        this._overlay.style.left = '.25rem';
        this._overlay.style.top = '1.25rem';
        this._overlay.style.zIndex = '99';
        this._overlay.style.transform = 'scale(-8,8) translate(-50%,50%)';
        this._overlay.style.textShadow = '#fff 0px 0px 1px, #fff 0px 0px 5px';
        this._header.dataset.drop = 'true';
        this._header.addEventListener('borbdragenter', (ev: BorbDragEvent) => {
            if (ev.dragSource instanceof TabEntry && ev.dragSource.canDropTo(this)) {
                if (BorbFrame._debug) console.log('FRAME enter', this.frameName, ev.target, ev);
                ev.allowDrop('move');
                if (ev.target === ev.dragSource) {
                    // do nothing
                } else if (ev.target instanceof TabEntry) {
                    ev.target.insertAdjacentElement(
                        ev.dragSource.isLeftOf(ev.target) ? 'afterend' : 'beforebegin',
                        ev.dragSource,
                    );
                } else {
                    this._nav.appendChild(ev.dragSource);
                }
            }
        });
        this._header.addEventListener('borbdragleave', (ev: BorbDragEvent) => {
            if (ev.dragSource instanceof TabEntry && !ev.newTarget) {
                if (BorbFrame._debug) console.log('FRAME leave', this.frameName, ev.target, ev);
                ev.dragState.cancelDropAttempt();
            }
        });
        this._header.addEventListener('borbdrop', (ev: BorbDragEvent) => {
            if (ev.dragSource instanceof TabEntry) {
                if (BorbFrame._debug)
                    console.log('FRAME drop', this.frameName, ev.target, ev.dragSource, ev, this);
                const nextElement = ev.dragSource.nextTabEntryElement();
                if (nextElement) {
                    assert(
                        nextElement !== ev.dragSource.element,
                        'nextElement !== ev.dragSource.element',
                    );
                    nextElement.insertAdjacentElement('beforebegin', ev.dragSource.element);
                    ev.acceptDrop('move');
                } else {
                    this.appendChild(ev.dragSource.element);
                    ev.acceptDrop('move');
                }
                if (ev.dropped) {
                    ev.dragSource.frame.queueUpdate(true);
                    ev.dragSource.frame._structureChanged = true;
                    ev.dragSource.select();
                    if (this != ev.dragSource.frame)
                        this._tabs.set(ev.dragSource.element, ev.dragSource);
                    ev.dragSource.frame = this;
                    this.updateChildren();
                    ev.dragSource.select();
                }
            }
        });
    }
    get debug() {
        return BorbFrame._debug;
    }
    set debug(d: boolean) {
        BorbFrame._debug = d;
    }
    get frameTitle(): string {
        const title = this.hasAttribute('frame-title')
            ? this.getAttribute('frame-title')
            : '${tab-title}';
        const tabAttrs = this.selected ? this.selected.titleAttrs : {};
        return interpolate(title, tabAttrs);
    }
    get frameName(): string {
        const title = interpolate(
            this.hasAttribute('frame-title') ? this.getAttribute('frame-title') : this.id,
            {},
        );
        return `${title}${this.selected ? ':' + this.selected.tabName : ''}`;
    }
    prevTab() {
        this.id;
    }
    /** Return the position of the given element in the tab list (-1 if not present) */
    getTabOrder(elt: HTMLElement) {
        return [...this._tabs.keys()].indexOf(elt);
    }
    protected update(childListChanged = false): void {
        if (!this.isConnected) return;
        if (childListChanged) this.updateChildren();

        this._tabs.forEach((tab) => tab.selected(tab === this.selected));
        //if(BorbFrame._debug) console.log("render", this, this, this.isConnected, this.shadowRoot, frameTitle, dh, minIcon, maxIcon);
        try {
            const title = this.selected?.titleAttrs['title-left'] ?? this.frameTitle ?? '';
            render(
                this._header.querySelector('h1'),
                html`<span class="title-left">${title}</span>${this.selected?.titleElts.mid ??
                    ''}${this.selected?.titleElts.right ?? ''}`,
            );
            render(
                this.shadowRoot,
                html`${this.styles}${this._header}
                ${this.classList.contains('no-tabs')
                    ? html`<slot></slot>`
                    : html`<slot name=${this.selected?.panel.slot || '<none>'}
                          ><div class="empty-slot"></div
                      ></slot>`}${this._overlay}`,
            );
        } catch (ex) {
            console.error('Frame.update', this, ex);
            throw ex;
        }
    }
    newTab(elt: HTMLElement): TabEntry {
        const entry = new TabEntry().init(elt, this);
        if (BorbFrame._debug) console.log('Frames:', this.frameName, 'adding tab', entry);
        this._tabs.set(elt, entry);
        return entry;
    }
    delTab(elt: Element) {
        const entry = this._tabs.get(elt);
        if (entry) {
            if (BorbFrame._debug)
                console.log('Frames:', this.frameName, 'removing tab', entry, entry.element);
            if (entry.parentElement === this._nav) entry.dispose();
            this._tabs.delete(elt);
        } else {
            if (BorbFrame._debug)
                console.log('Frames:', this.frameName, 'tab removed', entry, entry.element);
        }
    }

    select(elementOrName?: string | HTMLElement): boolean {
        if (!elementOrName) return super.select();

        this.updateChildren();
        const elt =
            typeof elementOrName === 'string'
                ? document.getElementById(elementOrName)
                : elementOrName;
        const tab = this._tabs.get(elt);
        if (tab) {
            tab.select();
            this.tabTransition();
            return true;
        } else {
            console.error(
                'BorbFrame.select: no tab found for ',
                elementOrName,
                elt,
                this.frameName,
                this,
            );
            this.queueUpdate();
            return false;
        }
    }

    protected updateChildren() {
        this._structureChanged = false;
        let selected: TabEntry = undefined;
        const lastSelected = this.selected;
        const removedChildren = new Set(this._tabs.keys());
        const before = [...this._nav.children];
        if (BorbFrame._debug) console.log('updateChildren', this.frameName, 'before', before);
        this._nav.replaceChildren();
        for (const elt of this.children) {
            if (['HEADER', 'FOOTER', 'ASIDE'].indexOf(elt.tagName) >= 0) continue;
            if (elt instanceof HTMLElement) {
                removedChildren.delete(elt);
                const entry = this._tabs.get(elt) ?? this.newTab(elt);
                if (!entry.hidden) {
                    this._nav.appendChild(entry);
                    if (entry === this.selected) selected = entry;
                }
            }
        }
        const after = [...this._nav.children];
        if (BorbFrame._debug) console.log('updateChildren', this.frameName, 'after', after);
        removedChildren.forEach((elt) => this.delTab(elt));
        if (selected) this.selected = selected;
        else this.selected = this._nav.children?.[0] as TabEntry;
        if (this.selected !== lastSelected) this.tabTransition();
        return !isEqual(before, after);
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.isConnected) {
            if (BorbFrame._debug) console.log('connected', this.tagName, this);
            if (!this.shadowRoot) {
                if (BorbFrame._debug) console.log('creating shadow root');
                this.attachShadow({ mode: 'open' });
            }
            this.addEventListener('focusin', this._focusin, false);
            this.addEventListener('focusout', this._focusout, false);
            if (BorbFrame._debug)
                console.log(
                    'element',
                    this.frameName,
                    'added to page.',
                    this,
                    this.isConnected,
                    this.shadowRoot,
                );
            this._observer.observe(this, {
                childList: true,
                attributeFilter: ['frame-title'],
            });
            DragNDrop.attachDropZone(this._header, '[role="tab"], header');

            uniqueId('tabbedFrame', this);
            // Styles.attach(styleRef, this._styleChangedHandler);
            this.queueUpdate(true);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._observer.disconnect();
        this._nav.replaceChildren();
        this._tabs.forEach((entry) => entry.dispose());
        this._tabs.clear();
        this.removeEventListener('focusin', this._focusin, false);
        this.removeEventListener('focusout', this._focusout, false);
        DragNDrop.detachDropZone(this._header);
        // Styles.detach(styleRef, this._styleChangedHandler);
        if (BorbFrame._debug) console.log('removed from page.', this.frameName, this);
    }

    adoptedCallback() {
        if (BorbFrame._debug) console.log('moved to new page.', this.frameName, this);
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (BorbFrame._debug)
            console.log(
                'element attributes changed.',
                this,
                this.shadowRoot,
                name,
                oldValue,
                newValue,
            );
        this.update();
    }
    // styleChanged() {
    //     this._style = Styles.get(styleRef);
    //     this.update();
    //     if(BorbFrame._debug) console.log('style changed', this, styleRef, this._style);
    // }
    tabTransition() {
        const icon = this.selected?.titleAttrs['icon'];
        if (icon) {
            this._overlay.innerText = icon;
            //this._overlay.innerHTML = `<svg viewBox="-16 -16 32 32" preserveAspectRatio="xMidYMid meet"><text font-size="16px" text-anchor="middle" dominant-baseline="middle"  >${icon}</text></svg>`;
            this._overlay.animate(
                [
                    { opacity: '0%' },
                    {
                        opacity: '50%',
                        offset: 0.5,
                    },
                    { opacity: '10%' },
                ],
                { duration: 1000, iterations: 1 },
            );
        }
    }
    _focusin(ev: FocusEvent) {
        this.classList.add('focused', 'focusin');
        const last = BorbFrame.currentFocus;
        if (BorbFrame._debug) console.log('focusin', this.frameName, 'this:', this, 'last:', last);
        if (last !== this) {
            BorbFrame.currentFocus = this;
            BorbFrame.lastFocus = last;
            if (last) last.classList.remove('focused', 'focusin');
        }
        if (ev) ev.stopPropagation();
    }
    _focusout(ev: FocusEvent) {
        if (BorbFrame._debug) console.log('focusout', this.frameName, this, ev);
        this.classList.remove('focusin');
        if (BorbFrame._debug) console.log(this.classList);
    }
}

export class BorbPanelBuilder<T extends HTMLElement = HTMLElement> {
    private _frame: BorbFrame;
    private _panel: T;
    private _title: string;
    private _id: string;
    private _strict: boolean;
    private _error: string[] = [];
    private _select: boolean;
    frame(targetFrame: BorbFrame | string): this {
        let fr =
            typeof targetFrame === 'string' ? document.getElementById(targetFrame) : targetFrame;
        if (!fr.tagName.startsWith('BORB-FRAME')) {
            const err = `Can't find frame, or not a BorbFrame: ${targetFrame}`;
            this._error.push(err);
            console.error(err, this, fr);
        } else {
            this._frame = fr as BorbFrame;
        }
        return this;
    }

    select(): this {
        this._select = true;
        return this;
    }
    title(title: string): this {
        this._title = title;
        return this;
    }
    panel<U extends HTMLElement = T>(panel: string): BorbPanelBuilder<U>;
    panel<U extends HTMLElement>(panel: U): BorbPanelBuilder<U>;
    panel<U extends HTMLElement>(panel: U | string): BorbPanelBuilder<U> | this {
        if (typeof panel === 'string') {
            this._panel = document.createElement(panel) as T;
            return this;
        } else {
            const builder = this as unknown as BorbPanelBuilder<U>;
            builder._panel = panel;
            return builder;
        }
    }

    get strict(): this {
        this._strict = true;
        return this;
    }
    done(): T {
        if (!this._frame) this._error.push(`no frame specified`);

        if (!this._title) this._error.push(`no title specified`);
        if (this._strict && this._error !== []) throw new Error(this._error.join('; '));

        if (!this._panel) this._panel = document.createElement('section') as T;
        if (this._title) this._panel.setAttribute('tab-title', this._title);
        if (this._id) this._panel.id = this._id;
        if (this._frame) {
            this._frame.appendChild(this._panel);
            if (this._select) this._frame.select(this._panel);
        }

        return this._panel;
    }
}

const _self = {
    _id: sysId(import.meta.url),
    _revision: revision,
    BorbFrame,
    BorbTab,
    BorbPanel,
    styleRef,
};
export const Frames = Systems.declare(_self)
    .reloadable(true)
    .depends('dom', Styles)
    .elements(BorbFrame, BorbTab, BorbPanel)
    .start((sys) => {
        customElements.define(TabEntry.tag, TabEntry, { extends: 'button' });
        return _self;
    })
    .register();
export default Frames;

if (import.meta.webpackHot) {
    import.meta.webpackHot.accept();
    import.meta.webpackHot.accept(styleRef, () => {
        Styles.update(styleRef);
    });
    import.meta.webpackHot.addDisposeHandler((data) => {
        console.warn('Unloading TabbedFrame');
        data['revision'] = revision;
        data['Frames'] = Frames;
    });
}
