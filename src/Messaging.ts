import StackTrace from 'stacktrace-js';
import { cloneDeepWith, fromPairs, toPairs } from 'lodash-es';
import Systems from './SubSystem';
import { sysId } from './Common';
import { html, render } from 'uhtml';
type Router = typeof _self;

const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;
const previousVersion: typeof _self =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['self']
        : undefined;
interface LogEntry {
    message: Message;
    connection?: Connection;
    timestamp: number;
    error?: Error;
    handler?: Monitor<Payload> | Method<Payload, Payload>;
    status: string;
}
export class MessagingError extends Error {
    msg: Message;
    reply?: Message | Payload;
    constructor(message: string, msg: Message, reply?: Message | Payload) {
        super(`${message}: ${JSON.stringify(msg)}`);
        this.msg = msg;
        this.reply = reply;
    }
}
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
export type Method<REQUEST extends Payload, REPLY extends Payload> = (
    msg: REQUEST,
) => Promise<REPLY>;
type Transport<REQUEST extends Payload, REPLY extends Payload> = (
    msg: Message,
) => Promise<Message | void> | void;

type Monitor<T extends Payload> = {
    resolve: (result: T | PromiseLike<T>) => void;
    reject: (err: Error) => void;
};

function formatLogEntry(entry: LogEntry) {
    const header = entry.message.header;

    return html`<tr>
        <td>${entry.timestamp}</td>
        <td>${entry.status}</td>
        <td>${header.msg_type}</td>
        <td>${header.msg_id}</td>
        <td>${header.from}</td>
        <td>${header.to}</td>
        <td>${JSON.stringify(entry.message.content)}</td>
        <td>${entry.connection?.id || entry.handler}</td>
        <td>${JSON.stringify(entry.error)}</td>
    </tr>`;
}
class MessagingImpl {
    _id = sysId(import.meta.url);
    _revision = revision;
    connections = new Map<string, Connection>();
    channels = new Map<string, Connection[]>();
    routes = new Map<string, Method<Payload, Payload>>();
    requests = new Map<string, Monitor<Payload>>();
    seq = 0;
    private _logging: boolean;
    private _log: LogEntry[] = [];
    constructor() {
        //
    }

    public showLog(dest: HTMLElement) {
        render(
            dest,
            html`<table>
                <tr>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Id</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Content</th>
                    <th>Route</th>
                    <th>Error</th>
                </tr>
                ${this._log.map(formatLogEntry)}
            </table>`,
        );
    }
    public route<T extends Payload, R extends Payload>(
        msgType: string,
        route: Method<T, R>,
    ) {
        this.routes.set(msgType, route);
    }

    public connect(conn: Connection, ...channels: string[]) {
        const enqueue = (message: Message) => {
            const logEntry: LogEntry = {
                message,
                connection: conn,
                timestamp: Date.now(),
                status: 'ok',
            };
            this._log.push(logEntry);
            conn.enqueue(message);
        };

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
                if (!msg.header.to) msg.header.to = 'local:';
                const promise = this._send(msg);
                if (promise) {
                    return promise
                        .then(
                            (content) =>
                                enqueue({
                                    header: {
                                        msg_type:
                                            msg.header.msg_type + '_reply',
                                        msg_id: `${this.seq++}`,
                                        ref_id: msg.header.msg_id,
                                        from: 'local:',
                                        to: conn.id,
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
                                    enqueue,
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
    private _deliverRemoteRequest(msg: Message): Promise<Payload> {
        const logEntry: LogEntry = {
            message: msg,
            timestamp: Date.now(),
            status: 'pending',
        };
        this._log.push(logEntry);
        console.log('deliverRemoteRequest(%o)', msg);
        const socketSendRequest = (conn: Connection): Promise<Payload> => {
            logEntry.connection = conn;
            try {
                logEntry.status = 'ok';
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
                logEntry.error = e;
                console.error('remote delivery error:', e);
                logEntry.status = 'error';
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
            return Promise.race(channels.map((ch) => socketSendRequest(ch)));
        }
        const err = new MessagingError('No route for message', msg);
        logEntry.error = err;
        return Promise.reject(err);
    }

    /** Returns a promise of a reply to the request, or void if no route was found */
    private _deliverLocalRequest(msg: Message): Promise<Payload> | void {
        const method = this.routes.get(msg.header.msg_type);
        const logEntry: LogEntry = {
            message: msg,
            handler: method,
            timestamp: Date.now(),
            status: 'pending',
        };
        this._log.push(logEntry);
        if (method) {
            console.log('deliverLocalRequest(%o)', msg);
            logEntry.status = 'ok';
            let promise: Promise<Payload>;
            try {
                promise = Promise.resolve(
                    method(msg.content) ?? { status: 'ok' },
                );
            } catch (e) {
                console.error('local delivery error:', e);
                logEntry.status = 'error';
                logEntry.error = e;
                promise = Promise.reject(e);
            }
            console.log('=>', promise);
            return promise;
        }
        logEntry.status = 'drop';
        console.warn('no route for deliverLocalRequest(%o)', msg);
    }
    /** Returns true if the reply was delivered, false otherwise */
    private _deliverLocalReply(msg: Message): Promise<Payload> | void {
        const id = `${msg.header.from || ''}:${msg.header.ref_id}`;
        const replyHandler = this.requests.get(id);
        const logEntry: LogEntry = {
            message: msg,
            handler: replyHandler,
            timestamp: Date.now(),
            status: 'pending',
        };
        this._log.push(logEntry);
        if (replyHandler) {
            console.log('deliverLocalReply(%o)', msg);
            logEntry.status = 'ok';
            this.requests.delete(id);
            if (msg.header.msg_type !== 'error_reply')
                replyHandler.resolve(msg.content);
            else replyHandler.reject(new MessagingError('Error', msg));
            return;
        } else {
            console.warn('unexpected reply:', id, msg);
            logEntry.status = 'drop';
            logEntry.error = new MessagingError('unexpected reply', msg);
            return;
        }
    }

    public async errorMsg(ref_id: string, err: Error): Promise<Message> {
        const st = await StackTrace.fromError(err);
        return {
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
        };
    }
    public reply(
        msg: Message,
        content: Payload & { status?: string },
    ): Message {
        if (!content) content = { status: 'ok' };
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
    public async send(
        payload: Payload,
        msgType: string,
        to?: string,
    ): Promise<Payload> {
        const msg: Message = {
            header: { msg_type: msgType, msg_id: `${this.seq++}` },
            content: payload,
        };
        if (!to) to = 'local:';
        msg.header.to = to;
        return (
            this._send(msg) ||
            Promise.reject(new MessagingError('No route for message', msg))
        );
    }

    _send(msg: Message) {
        if (msg.header.to === 'local:') {
            return msg.header.ref_id
                ? this._deliverLocalReply(msg)
                : this._deliverLocalRequest(msg);
        } else return this._deliverRemoteRequest(msg);
    }

    public set logging(enabled: boolean) {
        this._logging = enabled;
    }
    public get logging(): boolean {
        return this._logging;
    }

    fromMap = fromMap;
}
export class BaseConnection {
    queue: [Message, Transferable[]][] = [];
    status = 'waiting';
    connectHandlers = new Map<
        string,
        (conn: Connection, info: Payload) => void
    >();
    disconnectHandler = new Map<string, (conn: Connection) => void>();
    channels: string[];
    constructor(
        public router: typeof Messaging,
        public id: string,
        ...channels: string[]
    ) {
        this.deliverHost = router.connect(this, ...channels);
        this.channels = channels;
    }
    enqueue = (msg: Message, ...buffers: Transferable[]): void => {
        console.log('enqueue(%s,%o)', JSON.stringify(msg.header), msg);
        this.queue.push([msg, buffers]);
        if (this.queue.length === 1) queueMicrotask(() => this.processQueue());
    };
    processQueue() {
        this.status = 'processing';
        let msg: [Message, Transferable[]] | undefined;
        console.log('processing queue');
        while ((msg = this.queue.shift())) {
            console.log('delivering to', this.id, msg);
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
        throw new MessagingError('Function not implemented', msg);
    }
}

const _self = new MessagingImpl();

export function createMessaging() {
    return new MessagingImpl();
}

export const Messaging = Systems.declare(_self)
    .reloadable(false)
    .depends()
    .register();

if (import.meta.webpackHot) {
    import.meta.webpackHot.decline();
    import.meta.webpackHot.addDisposeHandler((data) => {
        console.warn(`Unloading ${_self._id}`);
        data['revision'] = revision;
        data['self'] = _self;
    });
}
