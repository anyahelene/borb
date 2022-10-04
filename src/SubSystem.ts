import type { BorbElement } from './BaseElement';
import { interpolate, isPromise, upgradeElements } from './Common';
import { set } from 'lodash-es';
// eslint-disable no-unused-vars
enum State {
    STOPPED,
    WAITING,
    STARTING,
    STARTED,
    NEW,
}
type API = {};
interface TargetObject {
    [propName: string]: object;
}
class SubSysBuilder<T extends { _id?: string; _revision?: number }> {
    data: SysData<T>;
    sys: SubSystem<T>;

    constructor(name: string, protoOrApi: T | (new () => T), revision: number) {
        this.sys = SubSystem.get(name);
        if (this.sys.data) revision = Math.max(this.sys.data.revision + 1, revision);
        this.sys._newData = this.data = {
            revision,
            deps: new Set<SubSystem<API>>(),
            api: undefined,
            proto: undefined,
            stop: undefined,
            start: undefined,
            state: State.STOPPED,
            customElements: [],
            reloadable: true,
        };
        if (typeof protoOrApi === 'function') {
            this.data.proto = protoOrApi;
        } else if (typeof protoOrApi === 'object') {
            this.data.api = protoOrApi;
        }
    }

    depends(...deps: (string | { _id: string })[]): this {
        for (const d of deps) {
            this.data.deps.add(SubSystem.get(typeof d === 'string' ? d : d._id));
        }

        return this;
    }

    stop(handler: () => Promise<void> | void): this {
        this.data.stop = handler;
        return this;
    }

    start(handler: (sys: SubSystem<T>) => Promise<T> | T): this {
        this.data.start = handler;
        return this;
    }

    prototype(proto: T | (new () => T)): this {
        this.data.proto = proto;
        return this;
    }

    api(api: T): this {
        this.data.api = api;
        api['_id'] = this.sys.name;
        api['_revision'] = this.data.revision;
        return this;
    }

    reloadable(reloadable: boolean): this {
        this.data.reloadable = reloadable;
        return this;
    }

    register(): T & { _id: string; _revision: number } {
        SubSystem.register(this.sys.name, this.data);
        const api = this.sys.proxy || this.data.api;

        return api as T & { _id: string; _revision: number };
    }

    elements(...customElements: typeof BorbElement[]): this {
        this.data.customElements.push(...customElements);
        return this;
    }
}
function nop() {
    //
}
const AsyncFunction = async function () {}.constructor;
function proxy<T extends API>(target: T | (new () => T), dep: SubSystem<T>) {
    let obj = typeof target === 'function' ? target.prototype : target;
    return new Proxy(obj, {
        get(target, p, receiver) {
            // get newest version
            /*
            if (SubSystem.hotReload) {
                const refreshed = dep.data.api;
                if (refreshed && refreshed !== obj) {
                    console.log('Subsystem refreshed: %s', dep.name, dep);
                    obj = refreshed;
                }
            }*/
            if (p === '_id') return dep.name;
            else if (p === '_revision') return dep.data.revision;
            else if (p === '_proxy') return true;
            else if (p === '_proxied') return obj;

            if (dep.data) {
                return dep.data.api[p];
            } else if (obj[p] instanceof AsyncFunction) {
                console.trace(`using proxy for ${dep.name}.${String(p)}`);
                // wrap it in an object to get correct name
                const funcObj: any = {
                    async [p](...args: any[]) {
                        await SubSystem.waitFor<T>(dep.name);
                        const fn = dep.data?.api[p];
                        if (typeof fn === 'function' && !fn.proxy) {
                            console.trace(`calling proxy for ${name}.${String(p)}`);
                            return fn(args);
                        }
                        throw new TypeError(`${String(p)} is not a function`);
                    },
                };
                const f = funcObj[p]; // as (...args:any[]) => Promise<any>;
                f.proxy = true;
                return f;
            } else {
                console.error(
                    `Accessing ${dep.name}.${String(p)} before ${dep.name} is ready`,
                    target,
                    p,
                    receiver,
                );
                throw new Error(`Accessing ${dep.name}.${String(p)} before ${dep.name} is ready`);
            }
        },
    });
}
type SysData<T extends API> = {
    stop: () => Promise<void> | void;
    start: (sys: SubSystem<T>) => Promise<T> | T;
    deps: Set<SubSystem<API>>;
    proto?: T | (new () => T);
    reloadable?: boolean;
    revision: number;
    api: T;
    customElements?: typeof BorbElement[];
    state: State;
};
export class SubSystem<T extends API> {
    public static targetObject: TargetObject;
    private static counter = 0;
    private static systems = new Map<string, SubSystem<API>>();
    private static queue: SubSystem<API>[] = [];
    private static makeProxies = true;
    private static alwaysProxy = false;
    private static ready = false;
    private static setupPromise = new Promise<TargetObject>((resolve) => {
        SubSystem.setupResolve = resolve;
    });
    static setupResolve: (value: TargetObject) => void;
    static #hotReload = false;
    promise: Promise<SubSystem<T>>;
    resolve: (value: SubSystem<T> | PromiseLike<SubSystem<T>>) => void;
    reject: (reason: Error) => void;
    readonly name: string;
    id: number;
    data: SysData<T>;
    _newData: SysData<T>;
    proxy: T;

    public static get hotReload() {
        return SubSystem.#hotReload;
    }
    public get api(): T | undefined {
        return this.data.api;
    }
    constructor(name: string) {
        this.name = name;
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        console.log('Created', this.toString());
    }

    dependencies(): Set<SubSystem<API>> {
        return new Set(this.data.deps);
    }

    dependents(): Set<SubSystem<API>> {
        const result: Set<SubSystem<API>> = new Set();
        SubSystem.systems.forEach((sys) => {
            if (sys.data.deps.has(this)) {
                result.add(sys);
            }
        });
        return result;
    }

    forEach(callback: (value: SubSystem<API>) => void): void {
        this.data.deps.forEach(callback);
    }
    isStarted(): boolean {
        return this.data?.state === State.STARTED;
    }

    status(): string {
        return `${this.data.state}`;
    }

    get state() {
        return this.data?.state ?? this._newData?.state ?? State.NEW;
    }

    toString(): string {
        return `${this.name} (${State[this.state]})`;
    }

    static debugAll(): void {
        console.group('Subsystems:');
        SubSystem.systems.forEach((dep) => dep.debug());
        console.groupEnd();
    }

    debug(): void {
        console.log(
            this.toString(),
            ':',
            [...(this.data?.deps ?? this._newData?.deps ?? [])].map((d) => d.name).join(', '),
        );
    }

    static get<T extends API>(sysName: string): SubSystem<T> {
        let sys = SubSystem.systems.get(sysName);
        if (!sys) {
            sys = new SubSystem(sysName);
            if (SubSystem.makeProxies) sys.proxy = proxy({}, sys);
            SubSystem.systems.set(sysName, sys);
        }
        return sys as SubSystem<T>;
    }

    static getApi<T extends API>(sysName: string): T {
        const sys = SubSystem.get(sysName) as SubSystem<T>;
        return sys.proxy || sys.data.api;
    }
    static setup(
        targetObject: TargetObject,
        config?: {
            proxy: boolean | 'always';
            hotReload: boolean;
            global: boolean;
        },
    ) {
        if (config?.global) globalThis.SubSystem = _self;
        SubSystem.targetObject = targetObject;
        SubSystem.makeProxies = !!config?.proxy;
        SubSystem.alwaysProxy = config?.proxy === 'always';
        SubSystem.#hotReload = !!config?.hotReload;
        SubSystem.ready = true;
        if (targetObject) {
            set(targetObject, 'borb.systems', _self);
        }
        SubSystem.setupResolve(targetObject);
    }
    static async waitFor<T extends API>(sysOrName: string | (T & { _id: string })): Promise<T> {
        const dep = SubSystem.get(typeof sysOrName === 'string' ? sysOrName : sysOrName._id);
        console.log('waiting for', dep);
        await dep.promise;
        console.log('waited for', dep);
        return Promise.resolve(dep.api as T);
    }
    static async waitForAll(...sysOrNames: (string | { _id: string })[]): Promise<void> {
        const deps = sysOrNames.map((sysOrName) =>
            SubSystem.get(typeof sysOrName === 'string' ? sysOrName : sysOrName._id),
        );
        console.log('waiting for', deps);
        await Promise.all(deps.map((d) => d.promise));
        console.log('waited for', deps);
    }
    static register(name: string, data: SysData<API>) {
        const sys = SubSystem.get(name);
        const old = sys.data;
        if (old && !old.reloadable) {
            throw new Error(`Already registered: ${sys.name}`);
        }
        data.state = State.WAITING;
        sys._newData = data;
        sys.setApi();

        console.log('Registered', sys.toString());
        const promises = [...data.deps].map((d) => d.promise);
        return Promise.all([SubSystem.setupPromise, ...promises])
            .then((res) => sys.init(res))
            .then(() => queueMicrotask(() => sys.resolve(sys)));
    }
    private setApi() {
        const data = this.data || this._newData;
        let api = data.api;
        if (SubSystem.alwaysProxy || (SubSystem.makeProxies && (!api || !this.data))) {
            api = this.proxy = proxy(data.api ?? data.proto ?? {}, this);
        } else {
            this.proxy = undefined;
        }

        if (api && SubSystem.targetObject) {
            set(SubSystem.targetObject, this.name.replace(/\//, '.'), api);
        }
    }
    async init(res): Promise<this> {
        console.log('init', this, res);
        const data = this._newData;
        const old = this.data;
        if (old && old.state !== State.STOPPED) {
            // stop old one
        }
        if (data.state !== State.STARTED && data.state !== State.STARTING) {
            try {
                this.data = this._newData;
                delete this._newData;
                data.state = State.STARTING;
                if (data.start) {
                    console.groupCollapsed(`Starting ${this.name} rev.${data.revision}`);
                    const res = data.start(this);
                    console.groupEnd();
                    if (isPromise(res)) {
                        console.log('Waiting for %s startup', this.name);
                        data.api = await res;
                    } else {
                        data.api = res;
                    }
                }
                this.setApi();
                if (data.customElements && data.customElements.length > 0)
                    await this.defineCustomElements();
                data.state = State.STARTED;
                // console.groupEnd();
                console.log('Started', this.toString());
                return this;
            } catch (reason) {
                // console.groupEnd();
                console.error(`While starting ‘${this.name}’:`, reason);
                data.state = State.STOPPED;
                if (reason instanceof Error) {
                    reason.message = `In subsystem ‘${this.name}’: ${reason.message}`;
                    return Promise.reject(reason);
                } else {
                    return Promise.reject(new Error(`In subsystem ‘${this.name}’: ${reason}`));
                }
            }
        } else {
            console.warn('Already started', this);
            return this;
        }
    }

    private async defineCustomElements(): Promise<void> {
        console.groupCollapsed(`Defining ${this.name} custom elements`);
        this.data.customElements.forEach((eltDef) => {
            try {
                console.debug('defining custom element %s: %o', eltDef.tag, eltDef);
                customElements.define(eltDef.tag, eltDef);
                if (this.data.revision > 0) upgradeElements(eltDef);
            } catch (e) {
                console.error(e);
            }
        });
        console.groupEnd();
    }

    static declare<T extends API>(
        nameOrObj: string | ((T | (new () => T)) & { _id: string; _revision?: number }),
        prototype?: T,
        revision = 0,
    ): SubSysBuilder<T> {
        if (typeof nameOrObj === 'string') return new SubSysBuilder(nameOrObj, prototype, revision);
        else if (nameOrObj._id)
            return new SubSysBuilder(nameOrObj._id, nameOrObj, nameOrObj._revision ?? revision);
    }
}

globalThis.addEventListener?.('DOMContentLoaded', (loadedEvent) => {
    SubSystem.declare('dom').register();
});

const _self = {
    debugAll: SubSystem.debugAll,
    register: SubSystem.register,
    get: SubSystem.get,
    getApi: SubSystem.getApi,
    setup: SubSystem.setup,
    waitFor: SubSystem.waitFor,
    waitForAll: SubSystem.waitForAll,
    declare: SubSystem.declare,
    util: {
        interpolate,
    },
    State,
};
export const Systems = _self;
export default Systems;

export interface BorbSys {
    subSystem: typeof _self;
}

declare module './SubSystem' {
    const BORB: BorbSys;
}
