import { BORB, SubSystem, BorbSys } from './SubSystem';
import { html, render } from 'uhtml';
import {
    BorbElement,
    tagName,
    assert,
    uniqueId,
    borbPrefix,
    sysId,
    BorbBaseElement,
} from './Common';
import { isEqual } from 'lodash-es';
import { DragNDrop, BorbDragEvent } from './DragNDrop';
import Styles from './Styles';

declare module './SubSystem' {
    interface BorbSys {
        frames: typeof Frames;
    }
}

//import 'css/frames.css';

type TabEvent = 'show' | 'hide';

type TabCallback = (data: any, tabEvent: TabEvent, origEvent: Event) => void;

const styleRef = 'css/frames.css';

const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;
const OldFrames: typeof Frames =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['Frames']
        : undefined;

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

class FrameDragState {
    _frame: BorbFrame;
    _srcNav: HTMLElement;
    _count = 0;
    _offsetX: number;
    _offsetY: number;
    _startX: number;
    _startY: number;
    _handler: (e: DragEvent) => void;
    constructor(src: BorbFrame, ev: DragEvent) {
        console.log('dragsession[frame]', src, ev);
        this._frame = src;

        this._frame.style.transitionProperty = '';
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('application/x-borb-frame', src.id);
        // ev.dataTransfer.setData("text/plain", src.id);
        // ev.preventDefault();
        src.appendChild(dragImage);
        console.log(window.getComputedStyle(dragImage));
        ev.dataTransfer.setDragImage(dragImage, -9999, -9999);
        console.log(ev.dataTransfer);
        src.classList.add('dragging');
        src.style.zIndex = '99';
        this._handler = (e: DragEvent) => this.dragHandler(e, src);
        document.addEventListener('dragover', this._handler);
    }

    endSession() {
        console.log(this._count);
        this.endDropAttempt();
        this._frame.classList.remove('dragging', 'moving');
        this._frame.classList.remove('moving');
        this._frame.style.transitionProperty = 'left,top';
        this._frame.style.top = '0';
        this._frame.style.left = '0';
        document.removeEventListener('dragover', this._handler);
    }

    endDropAttempt() {
        this._frame.classList.remove('moving');
        this._count = 0;
    }
    dragHandler(e: DragEvent, dest: BorbFrame) {
        const dataTransfer = e.dataTransfer;
        if (e.type == 'dragend') {
            this.endSession();
        } else if (e.type == 'dragover') {
            console.log(
                this._startX,
                this._startY,
                (e as any).layerX,
                (e as any).layerY,
            );
        } else if (e.type == 'dragenter' && dataTransfer) {
            console.info(
                'drag enter',
                e.currentTarget === e.target,
                this._count,
                e,
            );
            if (
                this._count === 0 &&
                dataTransfer.getData('application/x-borb-tabpanel')
            ) {
                this._frame.classList.add('moving');
                e.preventDefault();
            }
            this._count++;
        } else if (e.type == 'dragleave') {
            console.info(
                'drag leave',
                e.currentTarget === e.target,
                this._count,
                e,
            );
            this._count--;
            console.log(this._count);
            if (this._count === 0) {
                this.endDropAttempt();
            }
            e.preventDefault();
        } else if (e.type == 'drop') {
            this.endDropAttempt();
        }
    }
    enter(ev: BorbDragEvent, dest: BorbFrame) {}

    leave(ev: BorbDragEvent, dest: BorbFrame) {}

    canDropTo(dest: BorbFrame): boolean {
        return false;
    }
}

class TabEntry extends HTMLButtonElement {
    static nameAttrs = [
        'tab-title',
        'frame-title',
        'data-tab-title',
        'data-title',
        'data-frame-title',
    ];
    static tag = tagName('tab-button-internal', revision);
    element: HTMLElement;
    observer: MutationObserver;
    frame: BorbFrame;
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
        this.observer = new MutationObserver(() => this.update());
        this.observer.observe(this.element, {
            attributeFilter: TabEntry.nameAttrs,
        });
        this.element.slot = this.frame.classList.contains('no-tabs')
            ? ''
            : this.element.id;
        if (!this.panel.hasAttribute('role')) {
            this.panel.setAttribute('role', 'tabpanel');
        }
        this.addEventListener('click', this.select); // safe since 'click' is dispatched on 'this'
        DragNDrop.attachDraggable(this);
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
        return this.element.hidden || !this.tabTitle;
    }

    get tabTitle(): string {
        for (const name of TabEntry.nameAttrs) {
            if (this.element.hasAttribute(name))
                return this.element.getAttribute(name);
        }
        return '';
    }

    select() {
        console.warn('select', this);
        this.frame.selected = this;
        this.frame.queueUpdate();
        queueMicrotask(() => {
            // this.frame._focusin(undefined);
            this.panel.focus();
        });
    }
    get slotId(): string {
        return this.element.slot;
    }
    update() {
        render(this, html`<span>${this.tabTitle}</span>`);
    }

    isLeftOf(other: HTMLElement): boolean {
        return (
            this.parentElement === other.parentElement &&
            this.offsetLeft < other.offsetLeft
        );
    }

    get tag() {
        return TabEntry.tag;
    }
}

export class BorbFrame extends BorbBaseElement {
    static tag = tagName('frame', revision);
    static currentFocus: HTMLElement;
    static lastFocus: HTMLElement;
    public selected?: TabEntry;
    private _tabs: Map<Element, TabEntry> = new Map();
    private _nav: HTMLElement;
    private _observer: MutationObserver;
    private _childListChanged = true;
    private _doUpdate = false;
    // private _style: HTMLStyleElement;
    // private _styleChangedHandler = (ev: Event) => this.styleChanged();
    private _header: HTMLElement;
    constructor() {
        super(['css/common.css', styleRef]);
        // this._style = Styles.get(styleRef);
        this._observer = new MutationObserver((muts) => this.queueUpdate(true));
        this._nav = html.node`<nav class="tabs" role="tablist"></nav>`;
        const maxIcon = false ? '🗗' : '🗖';
        const minIcon = '🗕';
        this._header = html.node`<header>${this._nav}<h1 draggable="true"></h1>
            <nav class="window-tools"><button class="min-button">${minIcon}</button><button class="max-button">${maxIcon}</button></nav></header>`;
        this._header.dataset.drop = 'true';
        this._header.addEventListener('borbdragenter', (ev: BorbDragEvent) => {
            if (
                ev.dragSource instanceof TabEntry &&
                ev.dragSource.canDropTo(this)
            ) {
                console.log('FRAME enter', this.frameName, ev.target, ev);
                ev.allowDrop('move');
                if (ev.target === ev.dragSource) {
                    // do nothing
                } else if (ev.target instanceof TabEntry) {
                    ev.target.insertAdjacentElement(
                        ev.dragSource.isLeftOf(ev.target)
                            ? 'afterend'
                            : 'beforebegin',
                        ev.dragSource,
                    );
                } else {
                    this._nav.appendChild(ev.dragSource);
                }
            }
        });
        this._header.addEventListener('borbdragleave', (ev: BorbDragEvent) => {
            if (ev.dragSource instanceof TabEntry && !ev.newTarget) {
                console.log('FRAME leave', this.frameName, ev.target, ev);
                ev.dragState.cancelDropAttempt();
            }
        });
        this._header.addEventListener('borbdrop', (ev: BorbDragEvent) => {
            if (ev.dragSource instanceof TabEntry) {
                console.log(
                    'FRAME drop',
                    this.frameName,
                    ev.target,
                    ev.dragSource,
                    ev,
                    this,
                );
                const nextElement = ev.dragSource.nextTabEntryElement();
                if (nextElement) {
                    assert(
                        nextElement !== ev.dragSource.element,
                        'nextElement !== ev.dragSource.element',
                    );
                    nextElement.insertAdjacentElement(
                        'beforebegin',
                        ev.dragSource.element,
                    );
                    ev.acceptDrop('move');
                } else {
                    this.appendChild(ev.dragSource.element);
                    ev.acceptDrop('move');
                }
                if (ev.dropped) {
                    ev.dragSource.frame.queueUpdate(true);
                    ev.dragSource.frame._childListChanged = true;
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

    queueUpdate(childListChanged = false) {
        this._childListChanged ||= childListChanged;
        if (!this._doUpdate) {
            this._doUpdate = true;
            queueMicrotask(() => this.update());
        }
    }
    get frameTitle(): string {
        let title = this.hasAttribute('frame-title')
            ? this.getAttribute('frame-title')
            : '<tab-title>';
        let tabTitle = this.selected ? this.selected.tabTitle : '';
        return title.replace('<tab-title>', tabTitle);
    }
    get frameName(): string {
        let title = this.hasAttribute('frame-title')
            ? this.getAttribute('frame-title')
            : '<tab-title>';
        let tabTitle = this.selected ? this.selected.tabTitle : '';
        return title.replace('<tab-title>', '').replace(/^\s*(:\s*)?/, '');
    }
    prevTab() {
        this.id;
    }
    update() {
        if (!this.isConnected) return;
        this._doUpdate = false;
        if (this._childListChanged) this.updateChildren();

        this._tabs.forEach((tab) =>
            tab.setAttribute('aria-selected', String(tab === this.selected)),
        );
        //console.log("render", this, this, this.isConnected, this.shadowRoot, frameTitle, dh, minIcon, maxIcon);
        try {
            this._header.querySelector('h1').innerText = this.frameTitle ?? '';
            render(
                this.shadowRoot,
                html`${this.styles}${this._header}
                ${this.classList.contains('no-tabs')
                    ? html`<slot></slot>`
                    : html`<slot name=${this.selected?.panel.slot || '<none>'}
                          ><div class="empty-slot"></div
                      ></slot>`}`,
            );
        } catch (ex) {
            console.error('Frame.update', this, ex);
            throw ex;
        }
    }
    newTab(elt: HTMLElement): TabEntry {
        const entry = new TabEntry().init(elt, this);
        console.log('Frames:', this.frameName, 'adding tab', entry);
        this._tabs.set(elt, entry);
        return entry;
    }
    delTab(elt: Element) {
        const entry = this._tabs.get(elt);
        if (entry) {
            console.log(
                'Frames:',
                this.frameName,
                'removing tab',
                entry,
                entry.element,
            );
            if (entry.parentElement === this._nav) entry.dispose();
            this._tabs.delete(elt);
        } else {
            console.log(
                'Frames:',
                this.frameName,
                'tab removed',
                entry,
                entry.element,
            );
        }
    }

    select(elementOrName: string | HTMLElement) {
        this.updateChildren();
        const elt =
            typeof elementOrName === 'string'
                ? document.getElementById(elementOrName)
                : elementOrName;
        const tab = this._tabs.get(elt);
        if (tab) {
            tab.select();
        } else {
            console.error(
                'BorbFrame.select: no tab found for ',
                elementOrName,
                elt,
                this.frameName,
                this,
            );
            this.queueUpdate();
        }
    }

    updateChildren() {
        this._childListChanged = false;
        let selected: TabEntry = undefined;
        const removedChildren = new Set(this._tabs.keys());
        const before = [...this._nav.children];
        console.log('updateChildren', this.frameName, 'before', before);
        this._nav.replaceChildren();
        for (const elt of this.children) {
            if (elt instanceof HTMLElement) {
                removedChildren.delete(elt);
                let entry = this._tabs.get(elt) ?? this.newTab(elt);
                if (!entry.hidden) {
                    this._nav.appendChild(entry);
                    if (entry === this.selected) selected = entry;
                }
            }
        }
        const after = [...this._nav.children];
        console.log('updateChildren', this.frameName, 'after', after);
        removedChildren.forEach((elt) => this.delTab(elt));
        if (selected) this.selected = selected;
        else this.selected = this._nav.children?.[0] as TabEntry;
        return !isEqual(before, after);
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.isConnected) {
            console.log('connected', this.tagName, this);
            if (!this.shadowRoot) {
                console.log('creating shadow root');
                this.attachShadow({ mode: 'open' });
            }
            this.addEventListener('focusin', this._focusin, false);
            this.addEventListener('focusout', this._focusout, false);
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
        console.log('removed from page.', this.frameName, this);
    }

    adoptedCallback() {
        console.log('moved to new page.', this.frameName, this);
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
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
    //     console.log('style changed', this, styleRef, this._style);
    // }

    _focusin(ev: FocusEvent) {
        this.classList.add('focused', 'focusin');
        const last = BorbFrame.currentFocus;
        console.log('focusin', this.frameName, 'this:', this, 'last:', last);
        if (last !== this) {
            BorbFrame.currentFocus = this;
            BorbFrame.lastFocus = last;
            if (last) last.classList.remove('focused', 'focusin');
        }
        if (ev) ev.stopPropagation();
    }
    _focusout(ev: FocusEvent) {
        console.log('focusout', this.frameName, this, ev);
        this.classList.remove('focusin');
        console.log(this.classList);
    }
}

export const Frames = {
    _id: sysId(import.meta.url),
    _revision: revision,
    BorbFrame,
    BorbTab,
    BorbPanel,
    styleRef,
    version: 9,
    revision,
};
export default Frames;
SubSystem.declare(Frames)
    .reloadable(true)
    .depends('dom', Styles)
    .elements(BorbFrame, BorbTab, BorbPanel)
    .start((self, dep) => {
        customElements.define(TabEntry.tag, TabEntry, { extends: 'button' });
        return Frames;
    })
    .register();

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
