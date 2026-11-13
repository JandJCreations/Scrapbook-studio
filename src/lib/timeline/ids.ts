export type IdFn = () => string;

export function createId(): string {
  return crypto.randomUUID();
}
