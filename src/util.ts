import Ajv, { ValidateFunction } from 'ajv';

export function mapValues<T, R>(
  obj: T,
  mapper: (value: T[keyof T], key: keyof T) => R,
): { [K in keyof T]: R } {
  const next: { [key: string]: R } = {};
  for (const [key, value] of Object.entries(obj)) {
    next[key] = mapper(value as T[keyof T], key as keyof T);
  }

  return next as { [K in keyof T]: R };
}

const unset = Symbol('unset');

export function once<T>(fn: () => T): () => T {
  let value: T | typeof unset = unset;
  return () => {
    if (value === unset) {
      value = fn();
    }

    return value;
  };
}

export function mustValidate(fn: ValidateFunction, data: unknown) {
  if (!fn(data) && fn.errors) {
    throw new Ajv.ValidationError(fn.errors);
  }
}
