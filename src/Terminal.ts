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
const styleRef = 'css/terminal.css';

export type DisplayData = {
    data?: BlobPart | BlobPart[];
    url?: URL | string;
    type: string;
};
function writeLine(elt: HTMLElement, line: string): Element {
    let lineElt = elt.lastElementChild;
    if (!lineElt || !lineElt.classList.contains('borb-line-open')) {
        lineElt = html.node`<div class="borb-line borb-line-open"><div>`;
        elt.appendChild(lineElt);
    }
    lineElt.textContent = lineElt.textContent + line;
    return lineElt;
}
function newLine(elt: HTMLElement) {
    const lineElt = elt.lastElementChild;
    if (lineElt) lineElt.classList.remove('borb-line-open');
    return lineElt;
}
export class BorbTerminal extends BorbBaseElement implements Printer {
    static tag = tagName('terminal', revision);

    private _observer: MutationObserver = new MutationObserver((muts) => this.queueUpdate(true));
    private _keydownListener = (ev: KeyboardEvent) => {
        console.log(ev);
        if (ev.ctrlKey && ev.key === 'c') {
            return;
        } else if (ev.key === 'Control') {
            return;
        } else if (this._lineEditor) {
            this._lineEditor.focus();
        }
    };
    private _outElt: HTMLElement;
    private _inElt: HTMLElement;
    private _lineEditor: LineEditor;
    private _outAnchor: HTMLDivElement;
    private _whenReady: (value: BorbTerminal) => void;
    private _overlay: HTMLElement;
    public get overlay(): HTMLElement {
        return this._overlay;
    }
    public set overlay(value: HTMLElement) {
        this._overlay = value;
        this.queueUpdate();
    }
    /** A promise that will be fulfilled when the terminal is display on page */
    whenReady: Promise<BorbTerminal>;
    constructor() {
        super(['css/common.css', styleRef]);
        this._outElt = document.createElement('div');
        this._outElt.classList.add('terminal-out');
        this._inElt = document.createElement('div');
        this._inElt.classList.add('terminal-in');
        this._outAnchor = document.createElement('div');
        this.whenReady = new Promise((resolve) => {
            this._whenReady = resolve;
        });
    }

    public get lineEditor(): LineEditor {
        return this._lineEditor;
    }
    public set lineEditor(value: LineEditor) {
        this._lineEditor = value;
    }
    get inputElement(): HTMLElement {
        return this._inElt;
    }
    print(...args: string[]): string {
        const s = args.join(' ');
        const lines = s.split(/\r?\n/);
        let lastLine: Element;
        lines.forEach((line, i) => {
            if (i !== 0) {
                newLine(this._outElt);
            }
            lastLine = writeLine(this._outElt, line);
        });
        this.scrollToBottom();
        return s;
    }
    println(...args: string[]): string {
        return this.print(...args, '\n');
    }

    printElement(elt: HTMLElement): void {
        this.endline();
        this._outElt.appendChild(elt);
        this.scrollToBottom();
        console.log('printElement', elt);
    }
    endline() {
        const lastLine = newLine(this._outElt);
        this.scrollToBottom();
    }
    display(obj: DisplayData) {
        if (!obj.type.startsWith('image/')) {
            console.warn("%o.display(%o): don't know how to display %s", this, obj, obj.type);
            return;
        }
        let url = obj.url instanceof URL ? obj.url.toString() : obj.url;
        let revoke: () => void;
        if (obj.data) {
            const data = obj.data instanceof Array ? obj.data : [obj.data];
            const blob = new Blob(data, { type: obj.type });
            url = URL.createObjectURL(blob);
            revoke = () => URL.revokeObjectURL(url);
        }
        if (url) {
            const img = document.createElement('img');
            img.src = url;
            if (revoke) img.addEventListener('load', revoke, { once: true });
            this._outElt.appendChild(img);
        } else {
            console.warn('%o.display(%o): missing url or data:', this, obj);
        }
    }
    connectedCallback() {
        super.connectedCallback();
        if (this.isConnected) {
            console.log('connected', this.tagName, this);
            if (!this.shadowRoot) {
                console.log('creating shadow root');
                this.attachShadow({ mode: 'open' });
            }
            const settings = Systems.getApi<typeof Settings>('borb/settings');
            const session = settings.getConfig('session.name', '_');
            const shellName = this.getAttribute('shell') || '';
            const historyId = (session + '/' + shellName).replace(' ', '');
            console.log('opening %s shell for %s', shellName, session, historyId);

            console.log('element added to page.', this);
            this._observer.observe(this, {
                childList: true,
                attributeFilter: ['frame-title'],
            });
            this.addEventListener('keydown', this._keydownListener);
            this.queueUpdate();
            // DragNDrop.attachDropZone(this._header, '[role="tab"], header');
        }
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('keydown', this._keydownListener);
        this._observer.disconnect();
        // DragNDrop.detachDropZone(this._header);
        console.log('removed from page.', this);
    }

    update() {
        if (this.isConnected && this.shadowRoot) {
            render(
                this.shadowRoot,
                html`${this.styles} ${this._overlay || ''}
                    <div class="terminal-out-container" tabindex="-1">
                        ${this._outAnchor} ${this._outElt}
                    </div>
                    ${this._inElt}`,
            );
            if (this._whenReady) {
                this._whenReady(this);
                delete this._whenReady;
            }
        }
    }
    focus(options?: FocusOptions) {
        super.focus(options);
        if (this._lineEditor) this._lineEditor.focus();
        console.log('terminal focus', this);
    }
    ensureId() {
        if (!this.id) uniqueId('terminal', this);
        return this.id;
    }
    scrollToBottom() {
        this._outAnchor.scrollIntoView();
    }
    get status(): string {
        return this.getAttribute('status');
    }
    set status(s: string) {
        this.setAttribute('status', s);
    }
}

const _self = {
    _id: sysId(import.meta.url),
    _revision: revision,
    BorbTerminal,
    Frames,
};

export const Terminals = Systems.declare(_self)
    .reloadable(true)
    .depends('dom', Styles, Settings, LineEditors)
    .elements(BorbTerminal)
    .register();
console.warn('Terminals', Terminals);
export default Terminals;

if (import.meta.webpackHot) {
    import.meta.webpackHot.accept();
    import.meta.webpackHot.addDisposeHandler((data) => {
        console.warn(`Unloading ${_self._id}`);
        data['revision'] = revision;
        data['self'] = _self;
    });
}
