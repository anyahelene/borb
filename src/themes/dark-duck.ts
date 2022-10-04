import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// Using https://github.com/one-dark/vscode-one-dark-theme/ as reference for the colors
const type = '#cc0',
    name = '#3f3',
    op = '#56b6c2',
    invalid = '#f33',
    def = '#8f8',
    comment = '#880',
    func = '#3f3',
    string = '#a8e389',
    bool = '#d19a66',
    keyword = '#f6f',
    darkBackground = '#3330',
    highlightBackground = '#1114',
    background = '#3330',
    tooltipBackground = '#353a42',
    selection = '#3E4451',
    cursor = '#f00';
/// The editor theme styles for One Dark.
const darkDuckTheme = EditorView.theme(
    {
        '&': {
            color: def,
            backgroundColor: background,
            '& ::selection': { backgroundColor: selection },
            caretColor: cursor,
            //		backgroundBlendMode: "normal"
        },
        '.cm-cursor, .cm-dropCursor': {
            display: 'block',
            borderLeftColor: '#800',
            borderLeftWidth: '.5em',
        },
        '&.cm-focused .cm-cursor, &.cm-focused .cm-dropCursor': {
            borderLeftColor: '#f00',
        },
        '.cm-cursorLayer': { mixBlendMode: 'exclusion' },
        '&.cm-focused .cm-cursor-secondary': { borderLeftColor: '#ff0' },
        '.cm-cursor-secondary': { borderLeftColor: '#880' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content::selection': {
            backgroundColor: selection,
        },
        '.cm-panels': { backgroundColor: darkBackground, color: def },
        '.cm-panels.cm-panels-top': { borderBottom: '1px solid #8808' },
        '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #8808' },
        '.cm-searchMatch': {
            backgroundColor: '#72a1ff59',
            outline: '1px solid #457dff',
        },
        '.cm-searchMatch.cm-searchMatch-selected': {
            backgroundColor: '#6199ff2f',
        },
        '.cm-activeLine': {
            backgroundColor: highlightBackground,
            textShadow: 'none',
        },
        //   ".cm-activeLine": { backgroundColor: background, textShadow: "none" },
        '.cm-selectionMatch': { backgroundColor: '#aafe661a' },
        '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
            backgroundColor: '#bad0f847',
            outline: '1px solid #515a6b',
        },
        '.cm-gutters': {
            //		background: "linear-gradient(90deg, #220f 0%, #2200 100%)",
            backgroundColor: background,
            color: comment,
            border: 'none',
            borderRight: '1px solid #8808',
        },
        '.cm-activeLineGutter': {
            backgroundColor: highlightBackground,
        },
        '.cm-lineNumbers .cm-gutterElement': { color: 'inherit' },
        '.cm-foldPlaceholder': {
            backgroundColor: 'transparent',
            border: 'none',
            color: '#ddd',
        },
        '.cm-tooltip': {
            border: 'none',
            backgroundColor: tooltipBackground,
        },
        '.cm-tooltip .cm-tooltip-arrow:before': {
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
        },
        '.cm-tooltip .cm-tooltip-arrow:after': {
            borderTopColor: tooltipBackground,
            borderBottomColor: tooltipBackground,
        },
        '.cm-tooltip-autocomplete': {
            '& > ul > li[aria-selected]': {
                backgroundColor: highlightBackground,
                color: def,
            },
        },
    },
    { dark: true },
);
/// The highlighting style for code in the One Dark theme.
const darkDuckHighlightSpec = [
    {
        tag: tags.keyword,
        color: keyword,
    },
    {
        tag: [
            tags.name,
            tags.deleted,
            tags.number,
            tags.character,
            tags.propertyName,
            tags.macroName,
            tags.variableName,
            tags.separator,
        ],
        color: name,
    },
    {
        tag: [tags.function(tags.variableName), tags.labelName],
        color: func,
    },
    {
        tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
        color: bool,
    },
    {
        tag: [tags.definition(tags.name)],
        color: def,
    },
    {
        tag: [
            tags.typeName,
            tags.className,
            tags.changed,
            tags.annotation,
            tags.modifier,
            tags.self,
            tags.namespace,
        ],
        color: type,
    },
    {
        tag: [
            tags.operator,
            tags.operatorKeyword,
            tags.url,
            tags.escape,
            tags.regexp,
            tags.link,
            tags.special(tags.string),
        ],
        color: op,
    },
    {
        tag: [tags.meta, tags.comment],
        color: comment,
    },
    {
        tag: tags.strong,
        fontWeight: 'bold',
    },
    {
        tag: tags.emphasis,
        fontStyle: 'italic',
    },
    {
        tag: tags.strikethrough,
        textDecoration: 'line-through',
    },
    {
        tag: tags.link,
        color: comment,
        textDecoration: 'underline',
    },
    {
        tag: tags.heading,
        fontWeight: 'bold',
        color: name,
    },
    {
        tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
        color: bool,
    },
    {
        tag: [tags.processingInstruction, tags.string, tags.inserted],
        color: string,
    },
    {
        tag: tags.invalid,
        color: invalid,
        textDecoration: 'underline wavy red .05rem',
    },
];
const darkDuckHighlighter = HighlightStyle.define(darkDuckHighlightSpec);

/// Extension to enable the One Dark theme (both the editor theme and
/// the highlight style).
const darkDuck: Extension = [darkDuckTheme, syntaxHighlighting(darkDuckHighlighter)];

export { darkDuck, darkDuckHighlighter, darkDuckTheme, darkDuckHighlightSpec };
