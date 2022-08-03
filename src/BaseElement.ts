import { previousTagName } from './Common';
import Styles from './Styles';

export class BorbElement extends HTMLElement {
    static tag: string;
    constructor() {
        super();
    }
}

export abstract class BorbBaseElement extends BorbElement {
    static tag: string;
    styles: HTMLStyleElement[];
    private _doUpdate = false;
    protected _structureChanged = true;

    constructor(protected stylesUrls: string[] = []) {
        super();
    }

    connectedCallback() {
        if (this.isConnected) {
            this.styles = this.stylesUrls.map((styleRef) =>
                Styles.getStyleFor(this, styleRef),
            );
            this.queueUpdate();
        }
    }
    disconnectedCallback() {
        this.styles = this.stylesUrls.map((styleRef) =>
            Styles.disposeStyle(this, styleRef),
        );
    }

    queueUpdate(structureChanged = false) {
        this._structureChanged ||= structureChanged;
        if (!this._doUpdate) {
            this._doUpdate = true;
            queueMicrotask(() => {
                const change = this._structureChanged;
                this._doUpdate = false;
                this._structureChanged = false;
                if (this.isConnected) this.update(change);
            });
        }
    }

    abstract update(structureChanged: boolean): void | Promise<void>;
}
