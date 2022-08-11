import StackTrace from 'stacktrace-js';
import { cloneDeepWith, fromPairs, toPairs } from 'lodash-es';
import SubSystem from './SubSystem';
import { sysId } from './Common';
type Router = typeof _self;

const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;
const previousVersion: typeof _self =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['self']
        : undefined;

export function fromMap<T>(value: T): T {
    function converter(value: unknown) {
        if (value instanceof Map) {
            return fromPairs(
                cloneDeepWith(
                    toPairs(value as Map<string, unknown>),
                    converter,
                ),
            );
        }
    }
    return cloneDeepWith(value, converter);
}
export interface Connection {
    readonly id: string;

    enqueue(data: Message, ...buffers: ArrayBuffer[]): void;

    deliverHost: (msg: Message) => Promise<void>;

    addHandlers(
        owner: string,
        connectHandler: (conn: Connection, info: Payload) => void,
        disconnectHandler: (conn: Connection) => void,
    ): void;

    removeHandlers(owner: string): void;
}

export interface Message {
    header: Header;
    content: Payload;
}
export interface Header {
    msg_type: string;
    msg_id: string;
    ref_id?: string;
    from?: string;
    to?: string;
    status?: 'ok' | 'error';
}

export type Payload = Record<string, unknown>;
export type Method<
    REQUEST extends Payload = Record<string, unknown>,
    REPLY extends Payload = Record<string, unknown>,
> = (msg: REQUEST) => Promise<REPLY>;
type Transport<
    REQUEST extends Payload = Record<string, unknown>,
    REPLY extends Payload = Record<string, unknown>,
> = (msg: Message) => Promise<Message | void> | void;

type Monitor<T extends Payload> = {
    resolve: (result: T | PromiseLike<T>) => void;
    reject: (err: Error) => void;
};

class MessagingImpl {
    _id = sysId(import.meta.url);
    _revision = revision;
    connections = new Map<string, Connection>();
    channels = new Map<string, Connection[]>();
    routes = new Map<string, Method<Payload, Payload>>();
    requests = new Map<string, Monitor<Payload>>();
    seq = 0;
    constructor() {
        //
    }

    route<T extends Payload>(msgType: string, route: Method<T>) {
        this.routes.set(msgType, route);
    }

    connect(conn: Connection, ...channels: string[]) {
        if (this.connections.has(conn.id)) {
            throw new Error(`Connection already added: ${conn.id}`);
        } else {
            this.connections.set(conn.id, conn);
            channels.forEach((ch) => {
                const list = this.channels.get(ch) ?? [];
                list.push(conn);
                this.channels.set(ch, list);
            });
            return (msg: Message) => {
                if (msg instanceof Map) {
                    msg = fromMap(msg);
                }
                msg.header.from = conn.id;
                msg.header.to = 'local:';
                const promise = msg.header.ref_id
                    ? this.deliverLocalReply(msg)
                    : this.deliverLocalRequest(msg);
                if (promise) {
                    return promise
                        .then(
                            (content) =>
                                conn.enqueue({
                                    header: {
                                        msg_type:
                                            msg.header.msg_type + '_reply',
                                        msg_id: `${this.seq++}`,
                                        ref_id: msg.header.msg_id,
                                    },
                                    content,
                                }),
                            (err) =>
                                // conn.socketSend({
                                //     header: {
                                //         msg_type: 'error_reply',
                                //         msg_id: `${this.seq++}`,
                                //         ref_id: msg.header.msg_id,
                                //     },
                                //     content: { status: 'error' },
                                // }),
                                this.errorMsg(msg.header.msg_id, err).then(
                                    conn.enqueue,
                                ),
                        )
                        .catch((err) => {
                            console.error('remote delivery error', err);
                        })
                        .then(() => {
                            console.log('promise fulfilled', promise);
                        });
                } else return Promise.resolve();
            };
        }
    }

    /** Returns a promise of a reply to the request; reject if no route was found */
    deliverRemoteRequest(msg: Message): Promise<Payload> {
        const socketSendRequest = (conn: Connection): Promise<Payload> => {
            try {
                return new Promise((resolve, reject) => {
                    console.log(
                        'deliverRemoteRequest(%o) to conn=%o',
                        msg,
                        conn,
                    );
                    this.requests.set(conn.id + ':' + msg.header.msg_id, {
                        resolve,
                        reject,
                    });

                    conn.enqueue(msg);
                });
            } catch (e) {
                console.error('remote delivery error:', e);
                throw e;
                // if (e instanceof Error && e.name.startsWith('Jest')) {
                // }
                // return Promise.reject(e);
            }
        };

        const conn = this.connections.get(msg.header.to);
        if (conn) {
            return socketSendRequest(conn);
        }
        const channels = this.channels.get(msg.header.to) ?? [];
        if (channels.length > 0) {
            return Promise.race(channels.map((ch) => socketSendRequest(conn)));
        }
        return Promise.reject(
            new Error(`No route for ${JSON.stringify(msg.header)}`),
        );
    }

    /** Returns a promise of a reply to the request, or void if no route was found */
    deliverLocalRequest(msg: Message): Promise<Payload> | void {
        const method = this.routes.get(msg.header.msg_type);
        if (method) {
            console.log('deliverLocalRequest(%o)', msg);
            let promise: Promise<Payload>;
            try {
                promise = Promise.resolve(
                    method(msg.content) ?? { status: 'ok' },
                );
            } catch (e) {
                console.error('local delivery error:', e);
                promise = Promise.reject(e);
            }
            console.log('=>', promise);
            return promise;
        }
    }
    /** Returns true if the reply was delivered, false otherwise */
    deliverLocalReply(msg: Message): Promise<Payload> | void {
        const id = `${msg.header.from || ''}:${msg.header.ref_id}`;
        const replyHandler = this.requests.get(id);
        if (replyHandler) {
            console.log('deliverLocalReply(%o)', msg);
            this.requests.delete(id);
            if (msg.header.msg_type !== 'error_reply')
                replyHandler.resolve(msg.content);
            else replyHandler.reject(new Error(JSON.stringify(msg.content)));
            return;
        } else {
            console.warn('unexpected reply:', id, msg);
            return /*Promise.reject(
            new Error(`unexpected reply ${JSON.stringify(msg.header)}`),
        )*/;
        }
    }

    errorMsg(ref_id: string, err: Error): Promise<Message> {
        //return StackTrace.fromError(err)
        return Promise.resolve([]).then((st) => ({
            header: {
                msg_type: 'error_reply',
                msg_id: `${this.seq++}`,
                ref_id,
            },
            content: {
                status: 'error',
                ename: err.name,
                evalue: err.message,
                traceback: st,
            },
        }));
    }
    reply(msg: Message, content: Payload) {
        if (!content.status) content.status = 'ok';
        return {
            header: {
                msg_type: msg.header.msg_type + '_reply',
                msg_id: `${this.seq++}`,
                ref_id: msg.header.msg_id,
            },
            content,
        };
    }
    send(payload: Payload, msgType: string, to?: string): Promise<Payload> {
        const msg: Message = {
            header: { msg_type: msgType, msg_id: `${this.seq++}` },
            content: payload,
        };
        if (!to) to = 'local:';
        msg.header.to = to;

        if (to === 'local:') {
            const res = this.deliverLocalRequest(msg);
            console.log(res);
            return (
                res ||
                Promise.reject(
                    new Error(`No route for ${JSON.stringify(msg.header)}`),
                )
            );
        } else return this.deliverRemoteRequest(msg);
    }
}
export class BaseConnection {
    queue: [Message, Transferable[]][] = [];
    status = 'waiting';
    connectHandlers = new Map<
        string,
        (conn: Connection, info: Payload) => void
    >();
    disconnectHandler = new Map<string, (conn: Connection) => void>();
    constructor(public router: typeof Messaging, public id: string) {
        this.deliverHost = router.connect(this);
    }
    enqueue = (msg: Message, ...buffers: Transferable[]): void => {
        console.log('enqueue(%o)', msg);
        this.queue.push([msg, buffers]);
        if (this.queue.length === 1) queueMicrotask(() => this.processQueue());
    };
    processQueue() {
        this.status = 'processing';
        let msg: [Message, Transferable[]] | undefined;
        console.log('processing queue');
        while ((msg = this.queue.shift())) {
            this.deliverRemote(...msg);
        }
        console.log('processing done');
        this.status = 'waiting';
    }
    deliverRemote(msg: Message, transfers: Transferable[]) {
        console.log('SEND', msg);
    }
    deliverHost: (msg: Message) => Promise<void>;
    addHandlers(
        owner: string,
        connectHandler: (conn: Connection, info: Payload) => void,
        disconnectHandler: (conn: Connection) => void,
    ): void {
        this.connectHandlers.set(owner, connectHandler);
        this.disconnectHandler.set(owner, disconnectHandler);
    }
    removeHandlers(owner: string): void {
        this.connectHandlers.delete(owner);
        this.disconnectHandler.delete(owner);
    }
    send(msg: Message): void | Promise<void | Payload> {
        throw new Error('Function not implemented.');
    }
}

const _self = new MessagingImpl();

export const Messaging = _self;
export function createMessaging() {
    return new MessagingImpl();
}

SubSystem.declare(_self).reloadable(false).depends().register();

if (import.meta.webpackHot) {
    import.meta.webpackHot.decline();
    import.meta.webpackHot.addDisposeHandler((data) => {
        console.warn(`Unloading ${_self._id}`);
        data['revision'] = revision;
        data['self'] = _self;
    });
}
