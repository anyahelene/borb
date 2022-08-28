import { historyField } from '@codemirror/commands';
import { EditorSelection, EditorState, Facet, StateEffect, StateField } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import path from 'path';
import { html, render } from 'uhtml';
import { BorbBaseElement } from './BaseElement';
import { fontConfig, langConfig, stdConfig } from './CodeMirror';
import { Cancelled, sysId, tagName, uniqueId } from './Common';
import { Frames } from './Frames';
import { Settings } from './Settings';
import Styles from './Styles';
import Systems from './SubSystem';

const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;
const previousVersion: typeof _self =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['self']
        : undefined;
const styleRef = 'css/editor.css';
const PathNameFacet = Facet.define<string, string | undefined>({
    combine(vals: string[]) {
        console.warn('PathNameFacet.combine', vals);
        return vals[vals.length - 1];
    },
});
interface EditorLanguage {
    name: string;
    icon: string;
    extensions: string[];
    editMode: string;
    title: string;
    addFileExt(filename: string): string;
    toString?(): string;
}
interface EditIO {
    readtextfile(path: string): Promise<string>;
    writetextfile(path: string, text: string): Promise<void>;
    requestfile(mode: 'r' | 'w', lang?: string, currentPath?: string): Promise<string>;
    unlink(path: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    resolve(pathOrFilename: string): string;
    detectLanguage(
        pathOrText: { path: string; text?: string } | { text: string; path?: string },
    ): EditorLanguage;
}
function editorLanguage(name: string | EditorLanguage): EditorLanguage {
    if (typeof name === 'string')
        return {
            name,
            icon: '',
            extensions: [],
            editMode: name.toLowerCase(),
            title: name,
            addFileExt: (filename: string) => filename,
            toString: () => name,
        };
    else if (!name) return editorLanguage('plain');
    else return name;
}
type EditorEventName =
    | 'beforeDiscard'
    | 'beforeOpen'
    | 'afterOpen'
    | 'beforeLoad'
    | 'afterLoad'
    | 'beforeSave'
    | 'afterSave';
export class BorbEditor extends BorbBaseElement {
    static tag = tagName('editor', revision);
    static io: EditIO;
    private _observer: MutationObserver = new MutationObserver((muts) => this.queueUpdate(true));

    private _whenReady: (value: BorbEditor) => void;
    private _overlay: HTMLElement;
    private _edElt: HTMLElement;
    private _fileName = '*scratch*';
    private _language: EditorLanguage = editorLanguage('plain');
    private _initialText = '';
    private _pathName: string;
    private _view: EditorView;
    private _editable = true;
    private _modified = false;
    private _initialSelection: EditorSelection | { anchor: number; head?: number } = { anchor: 0 };
    private _autoSaveName: string;
    private _mtime: number;
    public get overlay(): HTMLElement {
        return this._overlay;
    }
    public set overlay(value: HTMLElement) {
        this._overlay = value;
        this.queueUpdate();
    }
    /** A promise that will be fulfilled when the terminal is display on page */
    whenReady: Promise<BorbEditor>;
    constructor() {
        super(['css/common.css', styleRef]);
        this._edElt = document.createElement('main');
        this._edElt.classList.add('editor');
        this._edElt.classList.add('wrapper');
        this.whenReady = new Promise((resolve) => {
            this._whenReady = resolve;
        });
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

            console.log('element added to page.', this);
            this._observer.observe(this, {
                childList: true,
                attributeFilter: [],
            });
            this.queueUpdate();
            // DragNDrop.attachDropZone(this._header, '[role="tab"], header');
        }
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this._observer.disconnect();
        if (this._view) {
            this._initialText = this._view.state.sliceDoc();
            this._initialSelection = this._view.state.selection;
            this._view.dom.remove();
            this._view = undefined;
        }
        // DragNDrop.detachDropZone(this._header);
        console.log('removed from page.', this);
    }

    #setPathName(fileName: string, language: EditorLanguage) {
        this._pathName = fileName;
        if (!fileName) {
            fileName = language.addFileExt('untitled');
        }
        this._fileName = path.basename(fileName);
        this._autoSaveName = path.join(path.dirname(fileName), `.#${this._fileName}#`);
        this.queueUpdate();
    }
    async #discard() {
        if (this._modified) {
            await this.autoSave();
            await this.#dispatchCancelable('beforeDiscard', {
                autoSave: this._autoSaveName,
                path: this._pathName,
                reason: 'open',
                canWait: true,
            });
            this._modified = false;
        }
        this._mtime = 0;
        this._pathName = undefined;
        this._fileName = undefined;
    }
    /** Replace editor contents with the given text. If `language` is not given, it's inferred from the file name
     * or text (defaults to `plain`). If `path` is not given, the editor is not associated with a file (see #save and #saveAs).
     *
     * Triggers auto save followed by a discard event if the editor has unsaved contents.
     *
     * Events: `beforeDiscard` (if editor has unsaved contents; cancelable, waitable), `beforeOpen` (cancelable), `afterOpen`  – details: `text`, `language`, `path`
     */
    async open({
        text,
        language,
        path,
    }: {
        text: string;
        language?: string | EditorLanguage;
        path?: string;
    }): Promise<{}> {
        await this.#discard();
        language = editorLanguage(language ?? BorbEditor.io.detectLanguage({ text, path }));
        this.#dispatchCancelable('beforeOpen', {
            text,
            language,
            path,
            canWait: false,
        });
        if (path) {
            path = language.addFileExt(path); // add if not already there
            path = BorbEditor.io.resolve(path);
        }
        this.#setPathName(path, language);
        this.#replaceDoc(text, language);
        this.#dispatchInfo('afterOpen', {
            language,
            path,
        });
        this.queueUpdate();
        return {};
    }
    #replaceDoc(text: string, language: EditorLanguage) {
        this._initialText = text;
        this._language = language;
        this._modified = false;
        if (this._view) {
            this._view.setState(this.#createState(this._language.editMode, this._initialText));
        }
    }

    /** Load and replace editor contents with the given file. If `language` is not given, it's inferred from the file name.
     *
     * Triggers auto save followed by a discard event if the editor has unsaved contents.
     *
     * Events: `beforeDiscard` (if editor has unsaved contents; cancelable, waitable), `beforeLoad` (cancelable), `afterLoad`  – details: `language`, `path`
     */
    async load({ path, language }: { path: string; language?: string | EditorLanguage }) {
        await this.#discard();

        path = BorbEditor.io.resolve(path);

        this.#dispatchCancelable('beforeLoad', {
            canWait: false,
            language,
            path,
        });
        const text = await BorbEditor.io.readtextfile(path);
        this._mtime = Date.now();
        language = editorLanguage(language ?? BorbEditor.io.detectLanguage({ text, path }));
        this.#setPathName(path, language);
        this.#replaceDoc(text, editorLanguage(language));
        this.#dispatchInfo('afterLoad', {
            language,
            path,
        });
        this.queueUpdate();
        return {};
    }

    /** Autosave editor contents.
     *
     * By default, the auto save file name is `.#FILENAME#`
     *
     * Events: `beforeSave` (cancelable), `afterSave` – details: `autoSave`:`true`, `path`: *autoSaveName*
     *
     */
    async autoSave(): Promise<void> {
        if (this._autoSaveName && BorbEditor.io) {
            this.#dispatchCancelable('beforeSave', {
                autoSave: true,
                path: this._autoSaveName,
                canWait: false,
            });
            const saveData = JSON.stringify(this.toJSON());
            await BorbEditor.io.writetextfile(this._autoSaveName, saveData);
            this.#dispatchInfo('afterSave', { autoSave: true, path: this._autoSaveName });
        } else return Promise.resolve();
    }
    /** Save current editor contents to the currently associated file. If there is no current file, attempts to ask for a new file name.
     *
     * Events: `beforeSave` (cancelable, waitable), `afterSave` – details: `autoSave`:`false`, `path`: *pathName*
     */
    async save(opts?: { all?: boolean }): Promise<void> {
        if (this._pathName) return this.saveAs(this._pathName, false);
        else if (!opts?.all) {
            console.log('requesting new file name', this);
            const name = await BorbEditor.io.requestfile('w', this.lang);
            if (name) {
                await this.saveAs(name, true);
            }
        }
    }

    /** Save current editor contents to the given path name. If `setPathName` is true, set `pathName` as current file.
     *
     * Events: `beforeSave` (cancelable, waitable), `afterSave`  – details: `autoSave`:`false`, `path`: *pathName*
     */
    async saveAs(pathName: string, setPathName = false): Promise<void> {
        if (pathName && BorbEditor.io && this._view) {
            pathName = BorbEditor.io.resolve(pathName);
            await this.#dispatchCancelable('beforeSave', {
                autoSave: false,
                path: pathName,
                canWait: true,
                mtime: this._mtime,
            });

            const text = this._view.state.sliceDoc();
            const currentState = this._view.state;

            await BorbEditor.io.writetextfile(pathName, text);
            this._mtime = Date.now();

            if (setPathName) this.#setPathName(pathName, this._language);

            if (this._view.state === currentState) {
                this._modified = false;
                this.#setStatus();
                if (this._pathName === pathName) {
                    try {
                        await BorbEditor.io.unlink(this._autoSaveName);
                    } catch (e) {
                        //ignore
                    }
                }
            }
            this.#dispatchInfo('afterSave', { autoSave: false, path: pathName });
        }
    }
    protected update() {
        if (this.isConnected && this.shadowRoot) {
            this.setAttribute('tab-title', this._fileName);
            this.setAttribute('path-name', this._pathName);
            this.setAttribute('lang-name', this._language.name);
            this.setAttribute('title', this._pathName);
            render(
                this.shadowRoot,
                html`${this.styles}${this._edElt}<footer
                        ><span class="edit-mode"
                            >${this._language.icon || this._language.name || ''}</span
                        ></footer
                    >`,
            );
            if (!this._view) {
                const lang = this._language;
                const text = this._initialText || '';
                const fileName = this._fileName || '*scratch*';
                console.log('opening %s editor for %s', lang);
                this.#initCodeMirror(this.#createState(lang.editMode, text, 0));
            }
            if (this._whenReady) {
                this._whenReady(this);
                delete this._whenReady;
            }
        }
        this.setAttribute('editable', `${!this._view.state.readOnly}`);
        this.#setStatus();
    }

    #createState(lang?: string, text?: string, pos?: number) {
        const selection = pos
            ? { anchor: pos < 0 ? text.length + 1 + pos : pos }
            : this._initialSelection;
        console.log('createState: ', lang, text, text.length, pos, selection);
        return EditorState.create({
            doc: text || '',
            extensions: [
                PathNameFacet.of(this._pathName),
                langConfig(lang || 'plain'),
                fontConfig(this._edElt),
                stdConfig(),
                EditorView.updateListener.of((upd) => this.#updateListener(upd)),
            ],
            selection: selection,
        });
    }
    #initCodeMirror(state: EditorState) {
        console.log('=> ', state);
        this._view = new EditorView({
            state,
            parent: this._edElt,
            root: this.shadowRoot,
        });
    }
    #updateListener(upd: ViewUpdate): void {
        if (upd.docChanged) {
            const wasChanged = this._modified;
            this._modified = true;
            if (!wasChanged) this.#setStatus();
        }
    }
    #setStatus() {
        const tabClass = [];
        if (!this._editable) tabClass.push('readonly');
        if (this._modified) tabClass.push('modified');
        this.setAttribute('tab-class', tabClass.join(' '));
    }

    focus(options?: FocusOptions) {
        super.focus(options);
        console.log('editor focus', this);
    }
    ensureId() {
        if (!this.id) uniqueId('editor', this);
        return this.id;
    }

    /** Return editor state as a JSON-serializable object */
    toJSON(): Record<string, unknown> {
        const obj = this._view.state.toJSON({ history: historyField });
        obj.pathName = this._pathName;
        if (this.parentElement && this.parentElement instanceof Frames.BorbFrame) {
            const order = this.parentElement.getTabOrder(this);
            if (order) obj.tabOrder = order;
        }
        if (this._view.state.readOnly) obj.readOnly = true;

        return obj;
    }
    get status(): string {
        return this.getAttribute('status');
    }
    set status(s: string) {
        this.setAttribute('status', s);
    }

    async #dispatchCancelable<T>(
        eventName: EditorEventName,
        detail: T & { canWait: boolean; wait?: () => Promise<boolean> },
    ) {
        const ev = new EditorEvent(eventName, detail);
        if (!this.dispatchEvent(ev)) {
            if (ev.detail.canWait && ev.detail.wait && (await ev.detail.wait())) return;
            else throw new Cancelled(`${eventName} of '${this.toString()}`);
        }
    }
    #dispatchInfo<T>(eventName: EditorEventName, detail: T) {
        this.dispatchEvent(new EditorEvent(eventName, detail, false));
    }
}

class EditorEvent<T> extends CustomEvent<T> {
    constructor(eventName: EditorEventName, detail: T, cancelable = true) {
        super(eventName, {
            bubbles: true,
            cancelable,
            composed: false, // propagate through shadow root – maybe?
            detail,
        });
    }
}

/** Return a query that matches editors open on the given path name */
const queryForFile = (path: string) => `${BorbEditor.tag}[path-name="${CSS.escape(path)}"]`;
/** Find an editor currently open on the given path name. Returns null if not found  */
const forFile = (path: string, root: ParentNode = document): BorbEditor =>
    root.querySelector(`${BorbEditor.tag}[path-name="${CSS.escape(path)}"]`);

/** If an editor is already open on the path, return it. Otherwise, create a new editor, load the the file, and return it.
 *
 * If `opts.select` is true (the default), the editor (existing or newly created) is selected/focused.
 
* If a new editor is created and `opts.addToDOM` is true (the default), the editor is added to the DOM based on the
 * current `editorParentStrategy` (if a suitable parent element is found).
 */
const openFile = async (
    path: string,
    language?: string | EditorLanguage,
    opts?: { addToDOM: boolean; select: boolean },
) => {
    let editor = forFile(path);
    if (!editor) {
        editor = new BorbEditor();
        await editor.load({ path, language });
        if (!opts || opts.addToDOM) editorParentStrategy.find((s) => s(editor));
    }
    if (!opts || opts.select) queueMicrotask(() => editor.select());

    return editor;
};

/** If `path` is given and an editor is already open on the path, return it. Otherwise, create a new editor with the given
 * text, and return it.
 *
 * If `opts.select` is true (the default), the editor (existing or newly created) is selected/focused.
 *
 * If a new editor is created and `opts.addToDOM` is true (the default), the editor is added to the DOM based on the
 * current `editorParentStrategy` (if a suitable parent element is found).
 */
const openText = async (
    text: string,
    path?: string,
    language?: string | EditorLanguage,
    opts?: { addToDOM: boolean; select: boolean },
) => {
    let editor = path ? forFile(path) : undefined;
    if (!editor) {
        editor = new BorbEditor();
        await editor.open({ text, path, language });
        if (!opts || opts.addToDOM) editorParentStrategy.find((s) => s(editor));
    }
    if (!opts || opts.select) queueMicrotask(() => editor.select());
    return editor;
};

/** Perform a *save()* on all editors in the document. Editors not associated with a file will be skipped.
 *  Returns a promise that will be satisfied when all saves are complete. */
const saveAll = () => {
    return Promise.all(
        [...document.querySelectorAll<BorbEditor>(`${BorbEditor.tag}`)].map((ed) =>
            ed.save({ all: true }),
        ),
    );
};
/** Perform an *autoSave()* on all editors in the document. Returns a promise that will be satisfied when all saves are complete. */
const autoSaveAll = () => {
    return Promise.all(
        [...document.querySelectorAll<BorbEditor>(`${BorbEditor.tag}`)].map((ed) => ed.autoSave()),
    );
};
/** Return the state of all open editors in JSON-serializable form. */
const serializeAll = () =>
    [...document.querySelectorAll<BorbEditor>(`${BorbEditor.tag}`)].map((ed) => ed.toJSON());
export type EditorParentStrategy = (ed: BorbEditor) => HTMLElement;

const editorParentSelectors = {
    /** Pick the element most used as a parent of editors (none if no editors present in document) */
    mostUsed: (ed: BorbEditor) => {
        const parents = new Map<HTMLElement, number>();
        document.querySelectorAll(BorbEditor.tag).forEach((ed) => {
            const count = parents.get(ed.parentElement) || 0;
            parents.set(ed.parentElement, count + 1);
        });
        let best: HTMLElement,
            bestCount = 0;
        parents.forEach((v, k) => {
            if (v > bestCount) {
                best = k;
                bestCount = v;
            }
        });
        if (best) best.appendChild(ed);
        return best;
    },
    /** Pick the element with the given id (defaults to `editor`) */
    byId:
        (id: string = 'editor') =>
        (ed: BorbEditor) => {
            const parent = document.getElementById(id);
            if (parent) parent.appendChild(ed);
            return parent;
        },
    /** Insert new editors as siblings of the element found by `query` (defaults to `[data-insert-here="editor"]`) */
    insertHere:
        (
            query: string = '[data-insert-here="editor"]',
            where: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend' = 'beforebegin',
        ) =>
        (ed: BorbEditor) => {
            const sibling = document.querySelector(query);
            if (sibling) sibling.insertAdjacentElement(where, ed);
            return sibling?.parentElement;
        },
};
let editorParentStrategy: EditorParentStrategy[] = [
    editorParentSelectors.insertHere(),
    editorParentSelectors.mostUsed,
    editorParentSelectors.byId(),
];
const _self = {
    _id: sysId(import.meta.url),
    _revision: revision,
    BorbEditor,
    openFiles: [],
    PathNameFacet,
    queryForFile,
    forFile,
    openFile,
    openText,
    saveAll,
    autoSaveAll,
    serializeAll,
    /** Available strategies for finding a parent element */
    editorParentSelectors,
    /** Set the strategy for finding a parent element for new elements.
     *
     * Defaults to `editorParentSelectors.insertHere()` (insert before element with attribute `data-insert-here="editor"`), followed by
     * `editorParentSelectors.mostUsed` (pick the element most editors have as parent), followed by
     * `editorParentSelectors.byId()` (pick the element with id `editor`)
     */
    set editorParentStrategy(strategy: EditorParentStrategy[]) {
        editorParentStrategy = strategy;
    },
    /** FOO */
    get editorParentStrategy() {
        return editorParentStrategy;
    },
};
export const Editors = Systems.declare(_self)
    .reloadable(true)
    .depends('dom', Styles, Settings)
    .elements(BorbEditor)
    .register();
console.warn('Editors', Editors);
export default Editors;

if (import.meta.webpackHot) {
    import.meta.webpackHot.accept();
    import.meta.webpackHot.addDisposeHandler((data) => {
        console.warn(`Unloading ${_self._id}`);
        data['revision'] = revision;
        data['self'] = _self;
    });
}
