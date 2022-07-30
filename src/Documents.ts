import SubSystem from './SubSystem';
import { BorbElement, tagName, uniqueId } from './Common';
import { Hole, html, render } from 'uhtml';
import { MDRender } from './MDRender';
import Styles from './Styles';

const subsys_name = 'Documents';
const revision: number =
  import.meta.webpackHot && import.meta.webpackHot.data
    ? import.meta.webpackHot.data['revision'] + 1
    : 0;
const previousVersion: typeof _self =
  import.meta.webpackHot && import.meta.webpackHot.data
    ? import.meta.webpackHot.data['self']
    : undefined;
const styleRef = 'css/markdown.css';

export class BorbDocument extends HTMLElement {
  static tag = tagName('document', revision);
  textElement: HTMLElement;
  _style: HTMLStyleElement;
  filename: string;
  mdRender: any;
  srcText?: string;
  _styleChangedHandler = () => this.styleChanged();
  _observer = new MutationObserver((muts) => this.update());
  _docChanged: boolean = true;
  _doUpdate: boolean = false;
  scrollElement: HTMLDivElement;
  constructor() {
    super();
    // hack to make it work with legacy MDRender
    this.scrollElement = document.createElement('div');
    this.scrollElement.classList.add('doc-display');
    this.textElement = document.createElement('section');
    this.textElement.classList.add('text');
    this.scrollElement.appendChild(this.textElement);
  }

  get src(): URL {
    const src = this.getAttribute('src');
    return src ? new URL(this.getAttribute('src'), document.URL) : undefined;
  }
  set src(url: string | URL) {
    this.setAttribute('src', url instanceof URL ? url.href : url);
  }
  get type() {
    return this.getAttribute('type');
  }
  set type(type: string) {
    this.setAttribute('type', type);
  }
  displayText(
    filename?: string,
    title?: string,
    text?: string,
    closeable = false,
  ) {
    if (!title && !this.title) {
      if (filename) {
        this.title = filename.replace(/^.*\//, '');
      } else this.title = 'Markdown';
    }
    if (!filename) {
      filename = this.id;
    }
    this.filename = filename;
    this.engine(filename).render_unsafe(this.textElement, text ?? '');
  }
  engine(url: URL | string): any {
    if (!this.mdRender) {
      this.mdRender = new MDRender({
        html: true,
        hrefPrefix: `${url}`.replace(/[^\/]*$/, ''),
      });
    }
    return this.mdRender;
  }
  async update(): Promise<void> {
    this._doUpdate = false;
    console.warn('Document update', this);
    const src = this.src;
    const docURL = new URL(document.URL);
    let srcText: string = this.srcText;
    if (src && src.protocol === 'file') {
      console.log('Document – TODO display file: ', src);
      return;
    } else if (
      src &&
      src.origin === docURL.origin &&
      src.pathname === docURL.pathname
    ) {
      if (src.hash) {
        const srcElement = document.getElementById(src.hash.slice(1));
        console.log('Document – TODO display element', src, srcElement);
      } else if (src.search) {
        console.log('Document – TODO display query', src, src.searchParams);
      } else {
        console.error('Invalid document URL', src, this);
      }
      return;
    } else if (src) {
      const res = await fetch(src, {
        method: 'GET',
        headers: { Accept: 'text/markdown, text/plain, text/*;q=0.9' },
      });
      if (res.status === 200) {
        srcText = await res.text();
      } else {
        this.srcText = `Error loading \`${src}\`: \`${res.status} ${res.statusText}\``;
        console.error('Unexpected request result:', src, res);
      }
    } else {
      srcText = '';
      this.childNodes.forEach((node) => {
        if (node instanceof Text) {
          srcText = srcText + node.textContent;
        } else if (node instanceof HTMLElement) {
          srcText = srcText + (node.innerText || '');
        }
      });
    }
    if (srcText) {
      if (srcText !== this.srcText) {
        this.srcText = srcText;
        await this.engine(src).render_unsafe(this.textElement, this.srcText);
      }
    } else {
      this.textElement.textContent = '';
    }
    render(this.shadowRoot, html`${this._style || ''}${this.scrollElement}`);
  }

  closeHandler(ev: Event) {
    console.log(
      'closing document: name=%s, title=%s',
      this.id,
      this.title,
      this,
    );
  }
  focus(options?: FocusOptions) {
    super.focus(options);
  }
  select(): void {}

  connectedCallback() {
    if (this.isConnected) {
      if (!this.shadowRoot) {
        this.attachShadow({ mode: 'open' });
      }
      console.log(
        'element added to page.',
        this,
        this.isConnected,
        this.shadowRoot,
      );
      this._observer.observe(this, {
        childList: true,
        attributeFilter: ['src', 'frame-title'],
      });

      uniqueId('document', this);
      Styles.attach(styleRef, this._styleChangedHandler);
      this.queueUpdate(true);
    }
  }

  disconnectedCallback() {
    this._observer.disconnect();
    console.log(
      'element  removed from page.',
      this,
      this.isConnected,
      this.shadowRoot,
    );
    Styles.detach(styleRef, this._styleChangedHandler);
  }

  styleChanged() {
    this._style = Styles.get(styleRef);
    this.update();
    console.log('style changed', this, styleRef, this._style);
  }
  queueUpdate(docChanged = false) {
    this._docChanged ||= docChanged;
    if (!this._doUpdate) {
      this._doUpdate = true;
      queueMicrotask(() => this.update());
    }
  }
}

const _self = { BorbDocument, styleRef, revision };
export const Documents = _self;

export default Documents;

SubSystem.declare(`borb/${subsys_name.toLowerCase()}`, _self, revision)
  .reloadable(true)
  .depends('dom', 'borb/styles')
  .elements(BorbDocument)
  .start((self, dep) => {})
  .register();

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept();
  // import.meta.webpackHot.accept(styleRef, () => {
  //     turtleduck.styles.update(styleRef);
  // });
  import.meta.webpackHot.addDisposeHandler((data) => {
    console.warn(`Unloading ${subsys_name}`);
    data['revision'] = revision;
    data['self'] = _self;
    console.log(previousVersion?.BorbDocument.tag, BorbDocument.tag);
  });
}
