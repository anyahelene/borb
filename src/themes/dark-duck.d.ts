import { Extension } from '@codemirror/state';
import { HighlightStyle } from '@codemirror/language';
declare const darkDuckTheme: Extension;
declare const darkDuckHighlightSpec: ({
    tag: import("@lezer/highlight").Tag;
    color: string;
    fontWeight?: undefined;
    fontStyle?: undefined;
    textDecoration?: undefined;
} | {
    tag: import("@lezer/highlight").Tag[];
    color: string;
    fontWeight?: undefined;
    fontStyle?: undefined;
    textDecoration?: undefined;
} | {
    tag: import("@lezer/highlight").Tag;
    fontWeight: string;
    color?: undefined;
    fontStyle?: undefined;
    textDecoration?: undefined;
} | {
    tag: import("@lezer/highlight").Tag;
    fontStyle: string;
    color?: undefined;
    fontWeight?: undefined;
    textDecoration?: undefined;
} | {
    tag: import("@lezer/highlight").Tag;
    textDecoration: string;
    color?: undefined;
    fontWeight?: undefined;
    fontStyle?: undefined;
} | {
    tag: import("@lezer/highlight").Tag;
    color: string;
    textDecoration: string;
    fontWeight?: undefined;
    fontStyle?: undefined;
} | {
    tag: import("@lezer/highlight").Tag;
    fontWeight: string;
    color: string;
    fontStyle?: undefined;
    textDecoration?: undefined;
})[];
declare const darkDuckHighlighter: HighlightStyle;
declare const darkDuck: Extension;
export { darkDuck, darkDuckHighlighter, darkDuckTheme, darkDuckHighlightSpec };
