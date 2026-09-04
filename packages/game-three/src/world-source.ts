export interface WorldSource {
  readonly subscribeRoster: (listener: () => void) => () => void;
  readonly getRosterSnapshot: () => readonly string[];
  readonly getPosition: (clientId: string) =>
    | {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      }
    | undefined;
}
