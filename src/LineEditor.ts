import {
    indentLess,
    indentMore,
    insertNewlineAndIndent,
} from '@codemirror/commands';
import { insertNewlineContinueMarkup } from '@codemirror/lang-markdown';
import {
    getIndentation,
    IndentContext,
    syntaxTree,
} from '@codemirror/language';
import {
    ChangeSpec,
    EditorSelection,
    EditorState,
    StateCommand,
    Transaction,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { html } from 'uhtml';
import { sysId } from './Common';
import Editor, {
    fontConfig,
    isBetweenBrackets,
    stdConfig,
    TDEditor,
} from './Editor';
import { HistorySession, history, History, Entry } from './History';
import Settings from './Settings';
import SubSystem from './SubSystem';
import type { BorbTerminal } from './Terminal';
const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;
const previousVersion: typeof _self =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['self']
        : undefined;
interface EditorService {
    createLineEditor(
        elt: HTMLElement,
        text: string,
        lang: string,
        handler: (key: string, state: unknown) => boolean,
        root: Document | ShadowRoot,
    ): Editor;
}
interface Shell {
    eval(line: string, outputElement?: HTMLElement): Promise<number>;
    printer: Printer;
    history: HistorySession;
}
interface Editor {
    focus(): void;
    attach(elt: HTMLElement): void;
    dispose(): void;
}
const historyKeys = {
    arrowUp: 'prev',
    arrowDown: 'next',
    pageUp: 'first',
    pageDown: 'last',
};
export class LineEditor {
    public editor: TDEditor;
    public history: HistorySession;
    public terminal: BorbTerminal;
    private _inElt: HTMLElement;
    private _outElt: HTMLElement;
    private _shell: Shell;
    histCommands: { [key: string]: () => Promise<Entry> };

    focus(): void {
        this.editor.focus();
    }

    constructor(
        term: BorbTerminal,
        inElt: HTMLElement,
        outElt: HTMLElement,
        lang?: string,
    ) {
        this.terminal = term;
        this._inElt = inElt;
        this._outElt = outElt;
        this.editor = createLineEditor(
            this._inElt,
            '',
            'shell' || 'plain',
            (key, state, dispatch) => this.handleKey(key, state, dispatch),
            term.shadowRoot,
        );
        this.histCommands = {
            arrowUp: () => this.history.prev(),
            arrowDown: () => this.history.next(),
            pageUp: () => this.history.first(),
            pageDown: () => this.history.last(),
        };
        this.terminal.status = 'waiting';
        const shellName = 'tshell';
        const p1 = SubSystem.waitFor<Shell>('tshell').then((sh) => {
            this._shell = sh;
            this._shell.printer = this.terminal;
        });
        const settings = SubSystem.getApi<typeof Settings>('borb/settings');
        const session = settings.getConfig('session.name', '_');
        const historyId = (session + '/' + shellName).replace(' ', '');
        const p2 = SubSystem.getApi<History>(history._id)
            .forSession(historyId)
            .then((hist) => (this.history = hist));
        Promise.all([p1, p2]).then(() => {
            this.terminal.status = 'ready';
            this._shell.history = this.history;
        });
    }

    handleKey(
        key: string,
        state: EditorState,
        dispatch: (tr: Transaction) => void,
    ): boolean {
        console.log('Terminal input:', key);
        const line = state.sliceDoc(0);
        if (!this.history) return false;
        if (key === 'enter') {
            this.enter(state, dispatch).finally(
                () => (this.terminal.status = 'ready'),
            );
            return true;
        } else if (this.histCommands[key]) {
            this.history
                .edit(line)
                .then(this.histCommands[key])
                .then((entry) => {
                    console.log('%s, got %o', key, entry);
                    if (entry) {
                        replaceDoc(state, dispatch, entry.data, -1);
                    }
                });
            return true;
        }
        return false;
    }

    async enter(
        state: EditorState,
        dispatch: (tr: Transaction) => void,
    ): Promise<number> {
        this.terminal.status = 'running';
        const line = state.sliceDoc();
        const id = await this.history.enter(line);
        const elt = this.editor.highlightTree(
            html.node`<span class="prompt" data-user="">[${id}]</span>`,
        );
        elt.classList.add('block');
        replaceDoc(state, dispatch, '');
        this.terminal.printElement(elt);
        const ret = await this._shell.eval(line, elt);
        return ret;
    }
    disableHistory(): void {
        //
    }
}

function replaceDoc(
    state: EditorState,
    dispatch: (tr: Transaction) => void,
    data: string,
    cursor = 0,
) {
    const text = state.toText(data);
    const len = text.length;
    if (cursor < 0) cursor = cursor + 1 + len;
    cursor = Math.max(0, Math.min(len, cursor));
    dispatch(
        state.update({
            changes: {
                from: 0,
                to: state.doc.length,
                insert: text,
            },
            selection: EditorSelection.cursor(cursor),
            scrollIntoView: true,
        }),
    );
}
export const createLineEditor = function (
    elt: HTMLElement,
    text: string,
    lang: string,
    handler: (
        key: string,
        state: EditorState,
        dispatch: (tr: Transaction) => void,
    ) => boolean,
    root: Document | ShadowRoot = document,
) {
    const outer = elt;
    const elts = elt.getElementsByClassName('wrapper');
    if (elts[0]) elt = elts[0] as HTMLElement;

    const enter: StateCommand = ({ state, dispatch }) => {
        let isComplete = true;
        const changes = state.changeByRange((range) => {
            console.groupCollapsed('enter key pressed at ', range);
            try {
                const text = state.sliceDoc(range.from);
                console.log('text: ', JSON.stringify(text));
                // check if we're in the middle of the text
                if (
                    text.length > 0 &&
                    (!text.match(/^\r?\n/) || text.startsWith('/'))
                ) {
                    // TODO: line-break setting?
                    isComplete = true;
                    return { range };
                }
                const explode =
                    range.from == range.to &&
                    isBetweenBrackets(state, range.from);
                const cx = new IndentContext(state, {
                    simulateBreak: range.from,
                    simulateDoubleBreak: !!explode,
                });
                let indent = getIndentation(cx, range.from);
                console.log('indent0: ', indent);
                if (indent == null)
                    indent = /^\s*/.exec(state.doc.lineAt(range.from).text)[0]
                        .length;
                console.log('indent1: ', indent, 'explode: ', explode);
                if (indent || explode) isComplete = false;

                const tree = syntaxTree(state);
                console.log('tree', tree);
                const context = tree.resolve(range.anchor);
                console.log('context', context);
                console.log(
                    'enter key pressed: from=%o, to=%o, anchor=%o, head=%o, state=%o',
                    range.from,
                    range.to,
                    range.anchor,
                    range.head,
                    state,
                );
                return { range };
            } finally {
                console.groupEnd();
            }
        });
        console.log('changes: ', changes);
        if (isComplete) {
            return handler('enter', state, dispatch);
        } else {
            return insertNewlineAndIndent({ state, dispatch });
        }
    };
    const tab: StateCommand = ({ state, dispatch }) => {
        const changes = state.changeByRange((range) => {
            console.log(
                'tab key pressed: from=%o, to=%o, anchor=%o, head=%o, state=%o',
                range.from,
                range.to,
                range.anchor,
                range.head,
                state,
            );
            const context = syntaxTree(state).resolve(range.from);
            console.log('context', context);
            return { range };
        });
        console.log('changes: ', changes);
        return indentMore({ state, dispatch });
    };
    const shiftEnter =
        lang === 'markdown' || lang === 'chat'
            ? insertNewlineContinueMarkup
            : insertNewlineAndIndent;
    const arrowUp: StateCommand = ({ state, dispatch }) => {
        return handler('arrowUp', state, dispatch);
    };

    const arrowDown: StateCommand = ({ state, dispatch }) => {
        return handler('arrowDown', state, dispatch);
    };

    const editor = new TDEditor(
        outer.id,
        outer,
        elt,
        text,
        lang,
        [
            fontConfig(elt),
            stdConfig(),
            EditorView.theme({
                '.cm-lineNumbers .cm-gutterElement': {
                    display: 'none',
                },
            }),
            keymap.of([
                { key: 'ArrowUp', run: arrowUp },
                { key: 'ArrowDown', run: arrowDown },
            ]),
        ],
        [
            keymap.of([
                { key: 'Enter', run: enter, shift: shiftEnter },
                { key: 'Tab', run: tab, shift: indentLess },
            ]),
        ],
        root,
    );

    editor._after_paste = () => {
        outer.scrollIntoView({ block: 'end', inline: 'nearest' });
    };
    return editor;
};

const _self = {
    _id: sysId(import.meta.url),
    _revision: revision,
    LineEditor,
};
export const LineEditors = _self;
export default LineEditors;

SubSystem.declare(_self)
    .reloadable(true)
    .depends('dom', history, Editor)
    .elements()
    .register();

if (import.meta.webpackHot) {
    import.meta.webpackHot.accept();
    import.meta.webpackHot.addDisposeHandler((data) => {
        console.warn(`Unloading ${_self._id}`);
        data['revision'] = revision;
        data['self'] = _self;
    });
}
