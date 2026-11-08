/** An undoable action. Both directions talk to the backend, so they are async. */
export interface Command {
  label: string;
  run(): Promise<void>;
  undo(): Promise<void>;
}

/**
 * Undo/redo stack. A command only lands on the stack when it succeeded; a
 * failing undo/redo keeps the stacks unchanged. Fires "change".
 */
export class History extends EventTarget {
  private _done: Command[] = [];
  private _undone: Command[] = [];
  private _busy = false;

  constructor(private readonly _limit = 100) {
    super();
  }

  get canUndo(): boolean {
    return !this._busy && this._done.length > 0;
  }

  get canRedo(): boolean {
    return !this._busy && this._undone.length > 0;
  }

  async execute(command: Command): Promise<void> {
    await this._guard(async () => {
      await command.run();
      this._done.push(command);
      if (this._done.length > this._limit) this._done.shift();
      this._undone = [];
    });
  }

  async undo(): Promise<void> {
    const command = this._done.at(-1);
    if (!command || this._busy) return;
    await this._guard(async () => {
      await command.undo();
      this._done.pop();
      this._undone.push(command);
    });
  }

  async redo(): Promise<void> {
    const command = this._undone.at(-1);
    if (!command || this._busy) return;
    await this._guard(async () => {
      await command.run();
      this._undone.pop();
      this._done.push(command);
    });
  }

  clear(): void {
    this._done = [];
    this._undone = [];
    this.dispatchEvent(new Event("change"));
  }

  private async _guard(action: () => Promise<void>): Promise<void> {
    this._busy = true;
    this.dispatchEvent(new Event("change"));
    try {
      await action();
    } finally {
      this._busy = false;
      this.dispatchEvent(new Event("change"));
    }
  }
}
