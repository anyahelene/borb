export class IndexedMap<T, K extends keyof T> {
  private _primary: K;
  private _map: Map<T[K], T> = new Map();
  private _indices: { index: keyof T; indexMap: Map<T[typeof this.x], T[K]> }[];

  constructor(primary: K, ...indices: (keyof T)[]) {
    this._primary = primary;
    // type Helper<T, K extends keyof T> = { [index in K]: Map<T[index], T> };
    this._indices = indices.map((idx: keyof T) => ({
      index: idx,
      indexMap: new Map<T[typeof idx], T[K]>(),
    }));
  }

  put(obj: T) {
    const pk = obj[this._primary];
    const old = this._map.get(pk);
    if (old === obj) return;
    this._map.set(pk, obj);
    this._indices.forEach((idx) => {
      const key = obj[idx.index];
      const oldKey = old?.[idx.index];
      if (key !== oldKey) {
        idx.indexMap.delete(oldKey);
      }
      idx.indexMap.set(key, pk);
    });
  }
  delete(primaryKey: T[K]) {
    const old = this._map.get(primaryKey);
    this._map.delete(primaryKey);
    this._indices.forEach((idx) => {
      const oldKey = old[idx.index];
      idx.indexMap.delete(oldKey);
    });
  }
  deleteObject(obj: T) {
    const pk = obj[this._primary];
    this.delete(pk);
  }
  get(key: T[typeof index], index: keyof T = this._primary): T {
    if (index === this._primary) {
      return this._map.get(key as T[K]);
    } else {
      for (const idx of this._indices) {
        if (idx.index === index) {
          const pk = idx.indexMap.get(key);
          console.log('get', key, index, pk, this._map.get(pk));
          return pk ? this._map.get(pk) : undefined;
        }
      }
    }
  }

  keys(): IterableIterator<T[K]> {
    return this._map.keys();
  }
  clear(): T[] {
    const values = [...this._map.values()];
    this._map.clear();
    return values;
  }
}

export default IndexedMap;
