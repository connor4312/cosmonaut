import type * as Cosmos from '@azure/cosmos';

export type Thenable<T> = PromiseLike<T> | T;

export interface IResourceResponse<T> {
  readonly resource: T;
  readonly headers: { [key: string]: string | boolean | number };
  readonly statusCode: number;
  readonly substatus?: number;
  readonly requestCharge: number;
  readonly activityId: string;
  readonly etag: string;
}

export const mapCosmosResourceResponse = <A, B>(
  res: Cosmos.ResourceResponse<A>,
  value: B,
): IResourceResponse<B> => ({
  ...res,
  requestCharge: res.requestCharge,
  activityId: res.activityId,
  etag: res.etag,
  resource: value,
});

/**
 * Can be returned from {@link Partition.createOrUpdateUsing} to cancel the
 * update.
 */
export const AbortUpdate = Symbol('AbortUpdate');
