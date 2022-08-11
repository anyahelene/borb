import Dexie from 'dexie';
import { PromiseExtended } from 'dexie';
import { sysId } from './Common';
import { SubSystem } from './SubSystem';
const id = sysId(import.meta.url);
const revision: number =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['revision'] + 1
        : 0;
const previousVersion: typeof _self_proto =
    import.meta.webpackHot && import.meta.webpackHot.data
        ? import.meta.webpackHot.data['self']
        : undefined;

function make_key(s: string, id?: number): [string, string, number?] {
    const i = s.indexOf('/');
    const key: [string, string, number?] =
        i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, ''];
    if (id !== undefined) key.push(id);
    return key;
}
interface Session {
    session: string;
    shell: string;
    id: number;
    date: Date;
    shells: [string, number][];
}
export interface Entry {
    session?: string;
    shell?: string;
    id: number;
    data: string;
    origData?: string;
}
class HistoryDexie extends Dexie {
    sessions: Dexie.Table<Session, [string, string]>;
    entries: Dexie.Table<Entry, [string, string]>;
    constructor() {
        super('tdhist');
        this.version(5).stores({
            historyIds: 'session,historyId',
            historyEntries: '[session+historyId],line',
        });

        this.version(6)
            .stores({
                historyIds: 'session,historyId',
                historyEntries: '[session+historyId],line',
                sessions: '[session+shell]', // was 'session,historyId'
                entries: '[session+shell+id]', // was '[session+historyId],line'
            })
            .upgrade(async (tx) => {
                await tx
                    .table('historyIds')
                    .toCollection()
                    .each(async (entry) => {
                        console.log('upgrading', entry);
                        const key = make_key(entry.session);
                        console.log('=>', {
                            session: key[0],
                            shell: key[1],
                            id: entry.historyId,
                            date: new Date(),
                        });
                        await this.sessions.put({
                            session: key[0],
                            shell: key[1],
                            id: entry.historyId,
                            date: new Date(),
                            shells: [],
                        });
                    });
                return await tx
                    .table('historyEntries')
                    .toCollection()
                    .each(async (entry_1) => {
                        const key_1 = make_key(entry_1.session);
                        await this.entries.put({
                            session: key_1[0],
                            shell: key_1[1],
                            id: entry_1.historyId,
                            data: entry_1.line,
                        });
                    });
            });
        this.version(7).stores({
            historyIds: 'session,historyId',
            historyEntries: '[session+historyId],line',
            sessions: '[session+shell]', // was 'session,historyId'
            entries: '[session+shell+id],[session+shell]', // was '[session+historyId],line'
        });
    }

    open(): PromiseExtended<this> {
        return super.open() as PromiseExtended<this>;
    }
}

export enum SearchDirection {
    BACKWARDS = -1,
    FORWARDS = 1,
}
export interface HistorySession {
    search(
        query: string,
        dir?: SearchDirection,
        skip?: boolean,
    ): Promise<Entry | undefined>;
    init(): Promise<void>;
    get(id?: number): Promise<Entry>;
    edit(line: string): Promise<number>;
    enter(line?: string): Promise<number>;
    first(): Promise<Entry>;
    last(): Promise<Entry>;
    prev(): Promise<Entry>;
    next(): Promise<Entry>;
    list(): Promise<Entry[]>;
}

export interface History {
    _id: string;
    _revision: number;
    forSession(session: string): Promise<HistorySession>;
    get(session: string, id?: number): Promise<Entry>;
    put(session: string, data: string, id?: number): Promise<number>;
    list(session: string): Promise<Entry[]>;
    sessions(sortBy: string): Promise<Session[]>;
    currentId(session: string): Promise<number>;
}

let db: HistoryDexie;
class DBHistorySession implements HistorySession {
    private entry: Entry;
    private newEntry: Entry;
    private lastEntry: Entry;
    key: [string, string, number?];
    edits: Entry[] = [];
    session: string;
    qKey: { session: string; shell: string };
    constructor(session: string) {
        this.key = make_key(session);
        this.session = session;
        this.qKey = { session: this.key[0], shell: this.key[1] };
        this.initEntry(0);
    }
    async search(
        query: string,
        dir: SearchDirection = SearchDirection.BACKWARDS,
        skip = false,
    ): Promise<Entry | undefined> {
        const id = skip ? this.entry.id + dir : this.entry.id;
        const entry =
            dir === SearchDirection.BACKWARDS //
                ? await db.entries
                      .where(this.qKey)
                      .and((e) => e.id < id && e.data.indexOf(query) > 0)
                      .reverse()
                      .first() //
                : await db.entries
                      .where(this.qKey)
                      .and((e) => e.id > id && e.data.indexOf(query) > 0)
                      .first();
        if (entry) {
            return this.go(entry);
        } else {
            return undefined;
        }
    }

    private initEntry(id: number, data = '') {
        this.newEntry = { id, data, origData: '', ...this.qKey };
        this.entry = this.newEntry;
    }
    async init(): Promise<void> {
        const id = await DBHistory.currentId(this.session);
        this.initEntry(id);
    }
    async get(id?: number): Promise<Entry> {
        if (id === undefined) return this.entry;
        return this.edits[id] ?? (await DBHistory.get(this.session, id));
    }
    async edit(line: string): Promise<number> {
        if (line !== this.entry.data) {
            this.entry.data = line;
            this.edits[this.entry.id] = this.entry;
        }
        return this.entry.id;
    }
    async enter(line?: string): Promise<number> {
        if (line !== undefined) this.edit(line);
        this.edits = [];
        return DBHistory.put(this.session, this.entry.data).then((id) => {
            this.initEntry(id + 1);
            return Promise.resolve(id);
        });
    }
    private go(entry: Entry) {
        if (entry) {
            const edited = this.edits[entry.id];
            entry = this.entry = edited ?? { ...entry, origData: entry.data };
        }
        return entry;
    }
    async first(): Promise<Entry> {
        return this.go(await db.entries.where(this.qKey).first());
    }
    async last(): Promise<Entry> {
        const last = await db.entries.where(this.qKey).last();
        if (last && last.id > this.newEntry.id) {
            return this.go(last);
        } else {
            return this.go(this.newEntry);
        }
    }
    async prev(): Promise<Entry> {
        return this.go(
            await db.entries
                .where(this.qKey)
                .and((e) => e.id < this.entry.id)
                .reverse()
                .first(),
        );
    }
    async next(): Promise<Entry> {
        const next = await db.entries
            .where(this.qKey)
            .and((e) => e.id > this.entry.id)
            .first();
        return this.go(next ?? this.newEntry);
    }
    async list(): Promise<Entry[]> {
        return await history.list(this.session);
    }
}
const DBHistory: History = {
    _id: id,
    _revision: revision,
    async forSession(session: string): Promise<HistorySession> {
        const hist = new DBHistorySession(session);
        await hist.init();
        return hist;
    },
    async get(session: string, id?: number): Promise<Entry> {
        console.log('get', session, id, db, make_key(session, id));

        if (typeof id != 'number') {
            id = await this.currentId(session);
        }
        return await db.entries.get(make_key(session, id)).catch((e) => {
            console.error(e);
            return Promise.resolve({ id, data: undefined });
        });
    },

    put(session: string, data: string, id?: number): Promise<number> {
        const key = make_key(session);
        return db.transaction('rw', [db.sessions, db.entries], () =>
            db.sessions.get(key).then(async (x) => {
                const latest = x
                    ? { ...x, date: new Date() }
                    : {
                          session: key[0],
                          shell: key[1],
                          id: 0,
                          shells: [],
                          date: new Date(),
                      };
                const thisId = id ? id : latest.id + 1;
                console.log('latest:', latest, 'thisId:', thisId);
                latest.id = Math.max(thisId, latest.id);

                await db.sessions.put(latest);
                await db.entries.put({
                    session: key[0],
                    shell: key[1],
                    id: thisId,
                    data: data,
                });
                return Promise.resolve(thisId);
            }),
        );
    },

    list(session: string): Promise<Entry[]> {
        const key = make_key(session);
        return db.entries.where({ session: key[0], shell: key[1] }).toArray();
    },
    async sessions(sortBy = 'date'): Promise<Session[]> {
        const seen = {};
        const result = [];
        const ss = await db.sessions.reverse().sortBy(sortBy);
        for (let i = 0; i < ss.length; i++) {
            let session = ss[i];
            const count = await db.entries
                .where({ session: session.session, shell: session.shell })
                .count();
            const s = seen[session.session];
            if (s) {
                if (session.shell && count)
                    s.shells.push([session.shell, count]);
            } else {
                session = { ...session, shells: [[session.shell, count]] };
                seen[session.session] = session;
                result.push(session);
            }
        }
        return result;
    },
    async currentId(session: string): Promise<number> {
        const data = await db.sessions.get(make_key(session));
        if (data) {
            return data.id + 1;
        } else {
            return 0;
        }
    },
};

class FakeHistorySession implements HistorySession {
    private id: number;
    key: [string, string, number?];
    edits: string[] = [];
    line?: string;

    constructor(private readonly session: string) {}
    async search(
        query: string,
        dir?: SearchDirection,
        skip?: boolean,
    ): Promise<Entry> {
        throw new Error('Method not implemented.');
    }
    async get(id?: number): Promise<Entry> {
        return FakeHistory.get(this.session, id ? id : this.id);
    }
    async edit(line: string): Promise<number> {
        this.edits[this.id] = this.line = line;
        return this.id;
    }
    async enter(): Promise<number> {
        this.edits = [];
        return FakeHistory.put(this.session, this.line).then((id) => {
            this.id = id;
            return Promise.resolve(id);
        });
    }
    async first(): Promise<Entry> {
        throw new Error('Method not implemented.');
    }
    async last(): Promise<Entry> {
        throw new Error('Method not implemented.');
    }
    async prev(): Promise<Entry> {
        throw new Error('Method not implemented.');
    }
    async next(): Promise<Entry> {
        throw new Error('Method not implemented.');
    }

    async init(): Promise<void> {
        this.id = await FakeHistory.currentId(this.session);
    }
    async list(): Promise<Entry[]> {
        return [];
    }
}

const fakeHistorySessions = {};
const fakeHistoryEntries: { [sessionName: string]: Entry[] } = {};
const FakeHistory: History = {
    _id: id,
    _revision: revision,
    async forSession(session: string): Promise<HistorySession> {
        const hist = new FakeHistorySession(session);
        await hist.init();
        return hist;
    },
    async get(session: string, id?: number): Promise<Entry> {
        console.log('get', session, id, make_key(session, id));
        const key = make_key(session, id);
        if (!fakeHistoryEntries[session]) fakeHistoryEntries[session] = [];
        if (typeof id != 'number') {
            id = await this.currentId(session);
        }
        return (
            fakeHistoryEntries[session][id] || {
                id,
                data: '',
                session: key[0],
                shell: key[1],
            }
        );
    },

    put(session: string, data: string, id?: number): Promise<number> {
        if (!fakeHistoryEntries[session]) fakeHistoryEntries[session] = [];

        const key = make_key(session);
        const oldId = fakeHistorySessions[session] || 0;
        const thisId = id ? id : oldId + 1;
        fakeHistorySessions[session] = Math.max(thisId, oldId);
        fakeHistoryEntries[session][thisId] = {
            id: thisId,
            data: data,
            session: key[0],
            shell: key[1],
        };
        return Promise.resolve(thisId);
    },

    list(session: string): Promise<Entry[]> {
        if (!fakeHistoryEntries[session]) fakeHistoryEntries[session] = [];
        const entries = fakeHistoryEntries[session];
        return Promise.resolve(entries.slice());
    },
    async sessions(sortBy = 'date'): Promise<Session[]> {
        return Promise.resolve([]);
    },
    currentId(session: string): Promise<number> {
        let currentId = fakeHistorySessions[session];
        if (!currentId) currentId = 0;
        fakeHistorySessions[session] = currentId;
        return Promise.resolve(currentId);
    },
};

const _self_proto = {
    _id: id,
    _revision: revision,
    forSession(session: string): Promise<HistorySession> {
        return SubSystem.waitFor<History>(_self_proto._id).then((h) =>
            h.forSession(session),
        );
    },
    get(session: string, id?: number): Promise<Entry> {
        return SubSystem.waitFor<History>(_self_proto._id).then((h) =>
            h.get(session, id),
        );
    },
    put(session: string, data: string, id?: number): Promise<number> {
        return SubSystem.waitFor<History>(_self_proto._id).then((h) =>
            h.put(session, data, id),
        );
    },
    list(session: string): Promise<Entry[]> {
        return SubSystem.waitFor<History>(_self_proto._id).then((h) =>
            h.list(session),
        );
    },
    sessions(sortBy: string): Promise<Session[]> {
        return SubSystem.waitFor<History>(_self_proto._id).then((h) =>
            h.sessions(sortBy),
        );
    },
    currentId(session: string): Promise<number> {
        return SubSystem.waitFor<History>(_self_proto._id).then((h) =>
            h.currentId(session),
        );
    },
};
export let history: History = _self_proto;
export default history;

SubSystem.declare(_self_proto)
    .reloadable(true)
    .depends()
    .elements()
    .start(async () => {
        try {
            const dbobj = await new HistoryDexie().open();
            db = dbobj;
            console.log('history db open', db);
            history = DBHistory;
        } catch (err) {
            console.warn('HistoryDB open failed', err);
            history = FakeHistory;
        }
        return history;
    })
    .register();

if (import.meta.webpackHot) {
    import.meta.webpackHot.decline();
    import.meta.webpackHot.addDisposeHandler((data) => {
        console.warn(`Unloading ${_self_proto._id}`);
        data['revision'] = revision;
        data['self'] = _self_proto;
    });
}
