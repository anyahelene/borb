import { Systems } from './SubSystem';
import { tagName, handleKey, sysId } from './Common';
import { BorbBaseElement, BorbElement } from './BaseElement';
import { Hole, html, render } from 'uhtml';
import { DragNDrop, BorbDragEvent } from './DragNDrop';
import Styles from './Styles';
import Mousetrap from 'mousetrap';
import 'mousetrap/plugins/global-bind/mousetrap-global-bind';

declare module './SubSystem' {
    interface BorbSys {
        Buttons: typeof _self;
    }
}
const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;
const previousVersion: typeof _self =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['self']
        : undefined;
const styleRef = 'css/buttons.css';

export interface Command {
    name: string;
    element?: BorbCommand;
    icon?: string;
    text?: string;
    shortcut?: string;
    [propName: string]: unknown;
}
/** maps name to command object */
const commands: { [cmdName: string]: Command } = {};
/** maps button id to command name */
const defaultBindings: { [buttonId: string]: Command } = {};
const ctrlSymbols: { [keyName: string]: string } = {
    mac: '⌘',
    caret: '⌃',
    iso: '⎈',
};
const keyboardSymbols: { [keyName: string]: string } = {
    ctrl: ctrlSymbols.mac,
    shift: '⇧',
    tab: '↹',
    option: '⌥',
};

/** The borb-command element represents a command that can be bound to a key or button.
 *
 * @field name The unique id of the command
 * @field data-bind Default key/button binding
 * @field data-icon Default button/menu icon (emoji)
 * @field data-icon-src Image source for icon
 * @field data-alt-icon Alternative button/menu icon
 * @field data-text Default button/menu text
 * @field data-text-LL Localised text
 */
export class BorbCommand extends BorbElement {
    static tag = tagName('command');
    name = '';
    constructor() {
        super();
    }
    connectedCallback() {
        this.style.display = 'none';
        this.name = this.getAttribute('name') ?? '';
    }
    /** Run this command
     *
     * @param elt (optional) The element that triggered the command
     * @param event (optional)  The event that triggered the command
     */
    async run(elt: BorbCommand | BorbButton = this, event?: Event) {
        await handleKey(this.name, elt, event);
    }
}

function loadCommand(element: BorbCommand): Command {
    const cmd: Command = {
        name: element.getAttribute('name') ?? '',
        element: element,
        ...element.dataset,
    };
    const binding = element.dataset.bind;
    if (binding) {
        if (defaultBindings[binding]) {
            console.warn(
                'extra binding for key',
                binding,
                ':',
                cmd,
                ', original is',
                defaultBindings[binding],
            );
        } else {
            defaultBindings[binding] = cmd;
        }
    }
    if (cmd.name) {
        if (commands[cmd.name]) {
            console.warn(
                'extra definition for command',
                cmd.name,
                ':',
                cmd,
                ', original is',
                commands[cmd.name],
            );
        }
        commands[cmd.name] = cmd;
    }
    return cmd;
}

/** A button element that can be bound to a `borb-command`.
 *
 * @field id The button's unique id
 * @field data-shortcut Default key shortcut
 */
export class BorbButton extends BorbBaseElement {
    static tag = tagName('button');
    _command?: Command;
    clickHandler: (e: Event) => Promise<void>;
    changeHandler: (e: Event) => Promise<void>;
    constructor() {
        super(['css/common.css', styleRef]);
        this.attachShadow({ mode: 'open' });

        this.clickHandler = this._clickHandler.bind(this);
        this.changeHandler = this._changeHandler.bind(this);
        this.addEventListener('borbdragstart', (ev: BorbDragEvent) => {
            ev.originalEvent.dataTransfer.setData('text/plain', this.outerHTML);
            ev.originalEvent.dataTransfer.setData(
                'application/json',
                JSON.stringify({
                    type: 'button',
                    id: this.id,
                    binding: this.command.name,
                }),
            );
        });
    }

    static get observedAttributes() {
        return ['class', 'data-reverse', 'data-text', 'data-icon', 'data-status', 'type', 'checked'];
    }

    set command(cmd: Command) {
        this._command = cmd;
        this.update();
    }
    get command() {
        if (this._command) {
            return this._command;
        }

        let cmd = defaultBindings[this.id];
        if (!cmd && cmd !== null) {
            const elt = document.querySelector(
                `${BorbCommand.tag}[data-bind="${this.id}"]`,
            ) as BorbCommand;
            if (elt)
                cmd = loadCommand(elt);
        }
        return (
            cmd || {
                name: '',
                icon: this.dataset.icon || '',
                text: this.dataset.text || '',
            }
        );
    }

    get checked() {
        if (this.getAttribute('type') === 'switch') {
            return (this.shadowRoot.querySelector('input') as HTMLInputElement)?.checked;
        } else {
            return false;
        }
    }
    set checked(checked: boolean) {
        if (this.getAttribute('type') === 'switch') {
            const elt = (this.shadowRoot.querySelector('input') as HTMLInputElement);
            const old = elt.checked;
            elt.checked = checked;
            if (old !== checked) {
                 this.toggleAttribute('checked', checked);
            //     queueMicrotask(() => this.dispatchEvent(new Event('change')))
            }
        }
    }

    get name() {
        return this.getAttribute('name');
    }
    async _clickHandler(e: Event) {
        if (this.classList.contains('disabled')) {
            console.warn('click on disabled button: ', this);
            return;
        }
        console.log(e)
        if (this.getAttribute('type') === 'switch') {
            const checked = (this.shadowRoot.querySelector('input') as HTMLInputElement).checked;
            console.log("_clickHandler checked", checked)
            this.toggleAttribute('checked', checked);
        }
        /*
        const active = this.classList.contains('active');
        this.classList.add('active');

        // visual effect
        if (typeof this.timeoutId == "number") {
            window.clearTimeout(this.timeoutId);
        }
        this.timeoutId = window.setTimeout(() =>  {
            this.timeoutId = undefined;
            this.classList.remove('active');
        }, 300);

        if (!active) { // debounce
            */
        await this.run(e);
        //}
    }
    async _changeHandler(e: Event) {
        const checked = (this.shadowRoot.querySelector('input') as HTMLInputElement).checked;
        console.log("_changeHandler checked", checked)
        this.toggleAttribute('checked', checked);
        await this.run(e);
    }
    async run(e: Event) {
        if (e.type === 'change') {
            if (!this.dispatchEvent(new Event('change')))
                return;

        } else if (e.type === 'click') {
            if (!this.dispatchEvent(new Event('click')))
                return;
        }
        const cmd = this.command;
        if (cmd) {
            //  if(_self._debug) console.log("Run command", cmd, "button", this, "event", e);
            if (cmd.element) {
                await cmd.element.run(this, e);
            } else if (cmd.name) {
                await handleKey(cmd.name, this, e);
            } 
        } else {
            console.warn('No command bound to ', this, e);
            await handleKey(this.id, this, e);
        }
    }
    connectedCallback() {
        super.connectedCallback();
        DragNDrop.attachDraggable(this);
        this.update();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        DragNDrop.detachDraggable(this);
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (_self._debug)
            console.log(
                'element attributes changed.',
                name,
                oldValue,
                newValue,
            );
        if (name === 'checked') {
            const checked = newValue !== null;
            console.log('attribute changed', name, oldValue, newValue, this.checked, '==', checked)
            if (this.checked !== checked)
                this.checked = checked;
            return;
        } else if(name === 'data-status') {
            (this.shadowRoot.querySelector('input') as HTMLInputElement).disabled = newValue === 'pending' || newValue === 'disabled';
        }
        this.update();
    }

    template() {
        console.log('redraw, checked=', this.checked);
        const command = this.command;
        const text = command.text;
        let icon: string | Hole = command.icon || this.dataset.icon || '';
        if (command.iconSrc || this.dataset.iconSrc)
            icon = html`<img
                src="${command.iconSrc || this.dataset.iconSrc}"
                style="height:1em"
                alt="${icon}"
            />`;
        const shortcut: string = this.classList.contains('not-implemented')
            ? '(not implemented)'
            : command.shortcut || this.dataset.shortcut || '';
        const keys = shortcut
            .split('+')
            .map((s) => html`<span>${keyboardSymbols[s] || s}</span>`);

        const classList = `${icon ? 'has-icon' : 'no-icon'} ${text ? 'has-text' : 'no-text'
            }`;

        this.dataset.currentBinding = command.name;
        if (shortcut && shortcut !== '(not implemented)')
            Mousetrap.bindGlobal(shortcut, this.clickHandler);

        // if(_self._debug)  console.log(this.id, command, icon, shortcut, shortcutText, keys);
        const type = this.getAttribute('type') || 'button';
        if (type === 'button') {
            return html`${this.styles}
            <button
                id="${this.id}"
                onclick=${this.clickHandler}
                class="${classList}"
                type="button"
            >
                <span class="bg"></span><span class="icon">${icon}</span
                ><span class="text">${command.text}</span>
                <div class="shortcut">${keys}</div>
            </button> `;
        } else if (type === 'switch') {
            return html`${this.styles}
            <div class="switch">
            <label for=${this.id}>${command.text}</label>
            <input type="checkbox"
            id=${this.id}
            onchange=${this.changeHandler}
            class=${classList + ' switch'}
            .checked=${this.hasAttribute('checked')}>
            </div>
            </input>
            `
        }
    }

    update() {
        render(this.shadowRoot as Node, this.template());
    }
}

const _self = {
    _id: sysId(import.meta.url),
    _revision: revision,
    _debug: false,
    BorbButton,
    BorbCommand,
    commands,
    ctrlSymbols,
    keyboardSymbols,
};

export const Buttons = Systems.declare(_self)
    .reloadable(false)
    .depends('dom', Styles)
    .elements(BorbButton, BorbCommand)
    .register();

export default Buttons;
