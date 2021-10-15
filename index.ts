/**
 * AsyncMemCache will cache a record of async calls.
 * Old values will expire and eventually be
 * cut off for garbage collection.
 *
 * Remember to destroy when discarded to avoid interval memory leak:
 * @example
 *    const c = AsyncMemCache(5);
 *    // operations
 *    c.destroy();
 *    return
 */
export class AsyncMemCache<T> {
  private storage: Record<string, { promise: Promise<T>; resolvedAt?: Date }> =
    {};
  private interval: number;

  static INTERVAL_MULTIPLIER = 5;

  constructor(
    public ttlMs: number,
    public shouldCache: (value: T) => boolean = () => true
  ) {
    if (this.ttlMs <= 0) {
      throw new RangeError("ttlMs not a positive number");
    }
    this.interval = setInterval(() => {
      Object.keys(this.storage).forEach((key) => {
        if (this.expired(this.storage[key])) {
          delete this.storage[key];
        }
      });
    }, ttlMs * AsyncMemCache.INTERVAL_MULTIPLIER);
  }

  private expired({ resolvedAt }: { resolvedAt?: Date }): boolean {
    if (!resolvedAt) {
      return false;
    }
    return resolvedAt.valueOf() < new Date().valueOf() - this.ttlMs;
  }

  destroy() {
    clearInterval(this.interval);
  }

  get length() {
    return Object.keys(this.storage).length;
  }

  get(key: string, getFromSource: () => Promise<T>): Promise<T> {
    if (!(key in this.storage) || this.expired(this.storage[key])) {
      const innerPromise = getFromSource();

      const outerPromise = new Promise<T>((resolve, reject) => {
        const executor = async () => {
          try {
            const result = await innerPromise;

            if (!this.shouldCache(result)) {
              delete this.storage[key];

              resolve(result);
              return;
            }

            this.storage[key].resolvedAt = new Date();

            resolve(result);
          } catch (error) {
            delete this.storage[key];

            reject(error);
          }
        };
        executor();
      });

      this.storage[key] = { promise: outerPromise };
    }

    // this will execute _before_ the executor has run to completion
    return this.storage[key].promise;
  }
}
