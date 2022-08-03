import SubSystem from './SubSystem';
import { sysId, tagName, uniqueId } from './Common';
import { BorbBaseElement } from './BaseElement';
import { html, render } from 'uhtml';
import Styles from './Styles';
import { HistorySession, History, history } from './History';
import { Settings } from './Settings';

const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;
const previousVersion: typeof _self =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['self']
        : undefined;
const styleRef = 'css/terminal.css';

interface Shell {
    eval(line: string, outputElement?: HTMLElement): Promise<number>;
    printer: Printer;
}
interface Printer {
    print(...args: string[]): string;
    println(...args: string[]): string;
}

interface EditorService {
    createLineEditor(
        elt: HTMLElement,
        text: string,
        lang: string,
        handler: (key: string, state: unknown) => boolean,
        root: Document | ShadowRoot,
    ): LineEditor;
}
interface LineEditor {
    focus(): void;
    attach(elt: HTMLElement): void;
    dispose(): void;
}
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
}
class BorbTerminal extends BorbBaseElement implements Printer {
    static tag = tagName('terminal', revision);
    public editor: LineEditor;
    public history: HistorySession;
    private _observer: MutationObserver = new MutationObserver((muts) =>
        this.queueUpdate(true),
    );
    private _keydownListener = (ev: KeyboardEvent) => {
        if (ev.ctrlKey && ev.key === 'c') {
            return;
        } else if (ev.key === 'Control') {
            return;
        } else {
            this.editor.focus();
        }
    };
    private _outElt: HTMLElement;
    private _inElt: HTMLElement;
    private _cr = false;
    private _lineEditor: LineEditor;
    private _shell: Shell;
    constructor() {
        super(['css/common.css', styleRef]);
        this._outElt = html.node`<div class="terminal-out"></div>`;
        this._inElt = html.node`<div class="terminal-in"></div>`;
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
        lastLine.scrollIntoView();
        return s;
    }
    println(...args: string[]): string {
        return this.print(...args, '\n');
    }
    handleKey(key: string, state: unknown): boolean {
        console.log('Terminal input:', key);
        if (key === 'enter') {
            if (this._shell && this.history) {
                const line = (state as any).doc.toString();
                this.classList.add('running');
                this.enter(line).finally(() =>
                    this.classList.remove('running'),
                );
                return true;
            }
        }
        return false;
    }
    async enter(line: string): Promise<number> {
        const id = await this.history.edit(line);
        await this.history.enter();
        this.println(`[${id}] ${line}`);
        const ret = await this._shell.eval(line);
        return ret;
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.isConnected) {
            console.log('connected', this.tagName, this);
            if (!this.shadowRoot) {
                console.log('creating shadow root');
                this.attachShadow({ mode: 'open' });
            }
            const settings = SubSystem.getApi<typeof Settings>('borb/settings');
            const session = settings.getConfig('session.name', '_');
            const shellName = this.getAttribute('shell') || '';
            const historyId = (session + '/' + shellName).replace(' ', '');
            console.log(
                'opening %s shell for %s',
                shellName,
                session,
                historyId,
            );
            if (!this._lineEditor) {
                this._lineEditor = SubSystem.getApi<EditorService>(
                    'editor',
                ).createLineEditor(
                    this._inElt,
                    '',
                    shellName || 'plain',
                    (key, state) => this.handleKey(key, state),
                    this.shadowRoot,
                );
            }
            if (!this._shell) {
                SubSystem.waitFor<Shell>(shellName).then((sh) => {
                    this._shell = sh;
                    this._shell.printer = this;
                    this.queueUpdate();
                });
            }
            if (!this.history) {
                SubSystem.getApi<History>(history._id)
                    .forSession(historyId)
                    .then((hist) => (this.history = hist));
            }
            console.log('element added to page.', this);
            this._observer.observe(this, {
                childList: true,
                attributeFilter: ['frame-title'],
            });
            this.queueUpdate();
            // DragNDrop.attachDropZone(this._header, '[role="tab"], header');
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
                <div class="terminal-out-container">${this._outElt}</div>
                <div class="terminal-in-container">${this._inElt}</div>`,
        );
    }
}

const _self = {
    _id: sysId(import.meta.url),
    _revision: revision,
    BorbTerminal,
};
export const Terminals = _self;
export default Terminals;

SubSystem.declare(_self)
    .reloadable(true)
    .depends('dom', Styles, Settings, history, 'editor')
    .elements(BorbTerminal)
    .register();

if (import.meta.webpackHot) {
    import.meta.webpackHot.accept();
    import.meta.webpackHot.addDisposeHandler((data) => {
        console.warn(`Unloading ${_self._id}`);
        data['revision'] = revision;
        data['self'] = _self;
    });
}
