import { sysId } from './Common';
import Systems from './SubSystem';

const subsys_name = 'DragNDrop';
const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;

interface DropZone {
    query: string;
}
export const dropZones = new WeakMap<HTMLElement, DropZone>();
type DropEffect = 'none' | 'copy' | 'link' | 'move';
class DragState {
    count = 0;
    dropTarget?: HTMLElement;
    dropAllowed: DropEffect = 'none';
    dragSource?: HTMLElement;
    placeholder: HTMLElement;
    dropped?: [DropEffect, HTMLElement];
    offsets: { startX: number; startY: number; dragging: boolean };
    private _handler: (ev: DragEvent) => void;
    constructor() {
        this.placeholder = document.createElement('span');
        this.placeholder.hidden = true;
        this.placeholder.style.display = 'none';
        this.placeholder.setAttribute('role', 'presentation');
        this._handler = (ev: DragEvent) => {
            this.updateDrag(ev);
        };
    }

    /**
     * Returns the drag source back to its original position.
     */
    cancelDropAttempt() {
        if (this.dragSource)
            this.placeholder.insertAdjacentElement('afterend', this.dragSource);
    }
    reset() {
        this.placeholder.remove();
        this.dropAllowed = 'none';
        this.dropTarget = undefined;
        this.count = 0;
        if (this.dragSource) {
            this.dragSource.removeAttribute('borb-dragging');
            if (this.offsets) {
                document.removeEventListener('dragover', this._handler);
                this.dragSource.style.left = '';
                this.dragSource.style.top = '';
                this.dragSource.style.transitionProperty = 'left,top';
            }
        }
        this.offsets = undefined;
        this.dragSource = undefined;
        this.dropped = undefined;
    }
    startDrag(ev: DragEvent, dragSource: HTMLElement, dragStyle: string) {
        this.dragSource = dragSource;
        dragSource.insertAdjacentElement('beforebegin', this.placeholder);
        if (dragStyle === 'live') {
            this.offsets = {
                startX: ev.pageX,
                startY: ev.pageY,
                dragging: true,
            };
            dragSource.setAttribute('borb-dragging', 'live');
            document.addEventListener('dragover', this._handler);
            this.dragSource.style.transitionProperty = '';
        } else {
            this.offsets = undefined;
            dragSource.setAttribute('borb-dragging', 'true');
        }
    }
    pauseDrag(dropTarget: HTMLElement, ev: DragEvent) {
        if (this.offsets && this.dragSource && this.dragSource !== dropTarget) {
            this.dragSource.style.left = '';
            this.dragSource.style.top = '';
            this.offsets.dragging = false;
            console.log('pauseDrag', this.offsets);
        }
    }
    resumeDrag(dropTarget: HTMLElement, ev: DragEvent) {
        if (
            this.offsets &&
            !this.offsets.dragging &&
            this.dragSource &&
            this.dragSource !== dropTarget
        ) {
            // this.offsets.startX = ev.pageX;
            // this.offsets.startY = ev.pageY;
            this.offsets.dragging = true;
            console.log('resumeDrag', this.offsets);
        }
    }
    updateDrag(ev: DragEvent) {
        if (this.offsets?.dragging && this.dragSource) {
            const offsetX = ev.pageX - this.offsets.startX;
            const offsetY = ev.pageY - this.offsets.startY;
            this.dragSource.style.left = `${offsetX}px`;
            this.dragSource.style.top = `${offsetY}px`;
        }
    }
}
export class BorbDragEvent extends CustomEvent<{
    originalEvent: DragEvent;
}> {
    /** Previous target (if any) when entering new drop zone */
    public oldTarget?: HTMLElement;
    /** New target (if any) when leaving a drop zone */
    public newTarget?: HTMLElement;
    /** Element that was dropped (for borbdragend events – see also originalEvent.dataTransfer.getData()) */
    public dropped?: [DropEffect, HTMLElement];
    /** Element the event was fired on, Will always be a HTML element */
    declare target: HTMLElement;

    constructor(type: string, public originalEvent: DragEvent) {
        super(type, { bubbles: true, detail: { originalEvent } });
    }

    /** For borbdragenter events, call this to indicate that dropping may proceed */
    allowDrop(effect?: DropEffect) {
        if (this.type !== 'borbdragenter') {
            console.warn('allowDrop called on ' + this.type + ' event', this);
        }
        if (dragState.dropTarget === this.target) {
            if (!effect) effect = 'none';
            dragState.dropAllowed = effect;
        }
    }

    /** For borbdrop events, call this to indicate that a drop was accepted.
     *
     * Will set the `dropped` field.
     */
    acceptDrop(effect?: DropEffect): void {
        if (this.type !== 'borbdrop') {
            console.warn('acceptDrop called on ' + this.type + ' event', this);
        }
        if (dragState.dropTarget === this.target) {
            if (!effect) effect = dragState.dropAllowed;
            this.dropped = dragState.dropped = [effect, dragState.dragSource];
            this.originalEvent.preventDefault();
        }
    }
    /** The element that would receive the drop if we release the mouse button now */
    get dropTarget(): HTMLElement {
        return dragState.dropTarget;
    }
    /** Overall state */
    get dragState(): DragState {
        return dragState;
    }

    /** The element we're currently dragging */
    get dragSource(): HTMLElement {
        return dragState.dragSource;
    }
}

const dragState = new DragState();

function targetElement(tgt: EventTarget): HTMLElement {
    let elt = tgt as HTMLElement;
    if (elt.nodeType === Node.TEXT_NODE) {
        // might actually be a Text node
        elt = elt.parentElement;
    }
    return elt;
}
function dropTarget(elt: HTMLElement, zoneSpec: DropZone): HTMLElement {
    const query = zoneSpec?.query ?? '[data-drop]';
    elt = elt.closest(query);
    console.log('dropTarget', query, elt);
    // if (elt && dragState.offsets && elt === dragState.dragSource) {
    //     elt = elt.parentElement.closest('[data-drop="true"]');
    // }
    return elt;
}

function leaveDropTarget(ev: DragEvent, newTgt?: HTMLElement) {
    const tgt = dragState.dropTarget;
    if (dragState.dropTarget) {
        if (newTgt)
            console.log(
                'DragNDrop LEAVE',
                ev.type,
                dragState.dropTarget,
                'TO',
                newTgt,
                ev,
            );
        else console.log('DragNDrop LEAVE', ev.type, dragState.dropTarget, ev);
        dragState.dropTarget.removeAttribute('borb-drop');
        const bev = new BorbDragEvent(`borb${ev.type}`, ev);
        bev.newTarget = newTgt;
        if (ev.type === 'dragend') bev.dropped = dragState.dropped;
        dragState.dropTarget.dispatchEvent(bev);
        if (!newTgt) {
            dragState.dropAllowed = 'none';
            dragState.dropTarget = undefined;
            dragState.count = 0;
        }
    }
    return tgt;
}

function enterDropTarget(tgt: HTMLElement, ev: DragEvent, oldTgt: HTMLElement) {
    if (tgt) {
        dragState.count = 1;
        dragState.dropTarget = tgt;
        dragState.dropAllowed = 'none';
        if (oldTgt)
            console.log(
                'DragNDrop ENTER',
                ev.type,
                dragState.count,
                tgt,
                'FROM',
                oldTgt,
                ev,
            );
        else console.log('DragNDrop ENTER', ev.type, dragState.count, tgt, ev);
        const bev = new BorbDragEvent('borbdragenter', ev);
        bev.oldTarget = oldTgt;
        dragState.dropTarget.dispatchEvent(bev);
        dragState.dropTarget.setAttribute('borb-drop', dragState.dropAllowed);
    } else {
        dragState.count = 0;
        dragState.dropTarget = undefined;
    }
}
function handlers() {
    return Systems.getApi<typeof _self>(subsys_id).handlers;
}
const _dragenter = (ev: DragEvent) => handlers().dragenter(ev),
    _dragleave = (ev: DragEvent) => handlers().dragleave(ev),
    _dragover = (ev: DragEvent) => handlers().dragover(ev),
    _drop = (ev: DragEvent) => handlers().drop(ev),
    _dragstart = (ev: DragEvent) => handlers().dragstart(ev),
    _dragend = (ev: DragEvent) => handlers().dragend(ev);

export function attachDropZone(elt: HTMLElement, query = '[data-drop]') {
    dropZones.set(elt, { query });
    elt.addEventListener('dragenter', _dragenter);
    elt.addEventListener('dragleave', _dragleave);
    elt.addEventListener('dragover', _dragover);
    elt.addEventListener('drop', _drop);
}

export function detachDropZone(elt: HTMLElement) {
    elt.removeEventListener('dragenter', _dragenter);
    elt.removeEventListener('dragleave', _dragleave);
    elt.removeEventListener('dragover', _dragover);
    elt.removeEventListener('drop', _drop);
}

export function attachDraggable(elt: HTMLElement) {
    elt.addEventListener('dragstart', _dragstart);
    elt.addEventListener('dragend', _dragend);
    elt.draggable = true;
    console.log('DRAG ON', elt);
}
export function detachDraggable(elt: HTMLElement) {
    elt.removeEventListener('dragstart', _dragstart);
    elt.removeEventListener('dragend', _dragend);
    elt.draggable = false;
}

function dragstart(ev: DragEvent) {
    if (dragState.dropTarget || dragState.count !== 0) {
        console.error(
            'dragstart with existing dropTarget or count !== 0',
            dragState.dropTarget,
            dragState.count,
        );
        dragState.reset();
    }
    if (ev.currentTarget instanceof HTMLElement) {
        console.log('DragNDrop start', ev.currentTarget, ev, dragState);
        const elt = ev.currentTarget;
        dragState.startDrag(ev, elt, elt.dataset.dragStyle);
        ev.dataTransfer.setData('application/x-borb-dragging', elt.id);
        ev.dataTransfer.setDragImage(
            elt,
            elt.offsetWidth / 2,
            -elt.offsetHeight / 2,
        );
        //ev.dataTransfer.setDragImage(dragImage, -9999, -9999);
        const bev = new BorbDragEvent('borbdragstart', ev);
        elt.dispatchEvent(bev);
    }
}

function dragend(ev: DragEvent) {
    console.log('DragNDrop end', ev.currentTarget, ev, dragState);
    dragState.dragSource.removeAttribute('borb-dragging');
    leaveDropTarget(ev);
    dragState.reset();
}
function dragenter(ev: DragEvent) {
    const target = targetElement(ev.target);
    const drop = dropTarget(
        target,
        dropZones.get(ev.currentTarget as HTMLElement),
    );
    if (!drop) {
        console.warn('ignored   dragenter', dragState.count, ev, target);
        return;
    }
    if (dragState.dropTarget === drop) {
        dragState.count++;
        console.log('DragNDrop enter', dragState.count, drop, ev, target);
    } else {
        enterDropTarget(drop, ev, leaveDropTarget(ev, drop));
        dragState.pauseDrag(drop, ev);
    }
}
function dragleave(ev: DragEvent) {
    const target = targetElement(ev.target);
    const drop = dropTarget(
        target,
        dropZones.get(ev.currentTarget as HTMLElement),
    );
    if (!drop || drop !== dragState.dropTarget) {
        console.log(
            'ignored   dragleave',
            dragState.count,
            drop,
            '!==',
            dragState.dropTarget,
            ev,
            target,
        );
        return;
    } else if (--dragState.count > 0) {
        console.log('DragNDrop leave', drop, ev, target);
    } else {
        leaveDropTarget(ev);
        dragState.resumeDrag(drop, ev);
    }
}
function dragover(ev: DragEvent) {
    if (dragState.dropAllowed !== 'none') {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = dragState.dropAllowed;
        // console.log('dragover', dragState.count, dragState.dropTarget, ev);
    } else {
        ev.preventDefault();
    }
}
function drop(ev: DragEvent) {
    if (!dragState.dropTarget) {
        console.warn('DROP without dropTarget', ev, dragState);
        return;
    }
    if (dragState.dragSource)
        console.log(
            'DragNDrop DROP ELEMENT',
            dragState.dragSource,
            dragState.dropTarget,
            ev,
        );
    else
        console.log(
            'DragNDrop DROP DATA   ',
            ev.dataTransfer,
            dragState.dropTarget,
            ev,
        );
    leaveDropTarget(ev, dragState.dropTarget);
    ev.preventDefault();
    const bev = new BorbDragEvent('borbdrop', ev);
    try {
        dragState.dropTarget.dispatchEvent(bev);
    } finally {
        dragState.dropAllowed = 'none';
        dragState.dropTarget = undefined;
        dragState.count = 0;
    }
}

const _self = {
    _id: sysId(import.meta.url),
    DragState,
    dragState,
    attachDraggable,
    attachDropZone,
    detachDraggable,
    detachDropZone,
    BorbDragEvent,
    handlers: { dragstart, dragend, dragover, dragenter, dragleave, drop },
};
const subsys_id = `borb/${subsys_name.toLowerCase()}`;
const globalListener = (ev: DragEvent) => ev.preventDefault();
export const DragNDrop = Systems.declare(_self)
    .reloadable(true)
    .depends('dom')
    .start(() => {
        document.addEventListener('drop', globalListener);
        document.addEventListener('dragover', globalListener);

        return _self;
    })
    .register();
export default DragNDrop;

if (import.meta.webpackHot) {
    import.meta.webpackHot.accept();
    // import.meta.webpackHot.accept(styleRef, () => {
    //     turtleduck.styles.update(styleRef);
    // });
    import.meta.webpackHot.addDisposeHandler((data) => {
        console.warn(`Unloading ${subsys_name}`);
        document.removeEventListener('drop', globalListener);
        document.removeEventListener('dragover', globalListener);
        dragState.reset();
        data['revision'] = revision;
        data['self'] = _self;
    });
}
