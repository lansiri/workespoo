/**
 * A box that adapter callbacks read at call time, updated from effects. It stands in for a
 * ref where the lint rules forbid reading refs from state initialisers.
 */
export class Latest<T> {
  constructor(private current: T) {}
  get(): T {
    return this.current;
  }
  set(value: T): void {
    this.current = value;
  }
}
