import type * as Cosmos from '@azure/cosmos';
import { assertContainer, BaseModel, ModelConstructor } from './baseModel';
import { Partition } from './partition';
import { Thenable } from './types';

/**
 * Options for atomic operations.
 */
export interface IOptions<T> extends Cosmos.RequestOptions {
  /**
   * @private
   */
  initialValue?: T;

  /**
   * The number of times to retry the option on failure. Defaults to 3.
   */
  retries?: number;

  /**
   * @private
   */
  mustFind?: boolean;
}

/**
 * Updates a model using the given function. The function will
 * be retried automaticaly in case a conflict happens, so could be called
 * multiple times.
 *
 * Note that when calling this, the properties that were previously on
 * the model may be re-set if the model is reread from the database
 * as a result of a conflict. Therefore, you should make sure to have all
 * mutations happen inside the `updateFn` method, not before it.
 *
 * The update function should return the model when it's ready run the update,
 * or `undefined` to cancel the operation.
 *
 * @param updateFn Function called to update the model. Should return the
 * model after making modifications to it.
 * @param options Call options
 */
export async function update<M extends BaseModel<any>>(
  model: M,
  updateFn: (previous: M) => Thenable<M | undefined>,
  options?: IOptions<never>,
  container = assertContainer(model),
): Promise<M> {
  const result = await createOrUpdate(
    model.partition(container),
    model.id,
    m => {
      model.props = m!.props;
      return updateFn(model);
    },
    { ...options, initialValue: model, mustFind: true },
  );

  return result || model; // return the model even if op aborted
}

/**
 * Creates or updates a model using the given function. The function will
 * be retried automaticaly in case a conflict happens, so could be called
 * multiple times.
 *
 * @param id ID of the model to create or update
 * @param updateFn Function called to update the model. Should return the
 * model after making modifications to it.
 * @param options
 */
export function createOrUpdate<T extends { id: string }, TCtor extends ModelConstructor<T>>(
  partition: Partition<T, TCtor>,
  id: string,
  updateFn: (previous: InstanceType<TCtor> | undefined) => Thenable<InstanceType<TCtor>>,
  options?: IOptions<InstanceType<TCtor>>,
): Promise<InstanceType<TCtor>>;

/**
 * Creates or updates a model using the given function. The function will
 * be retried automaticaly in case a conflict happens, so could be called
 * multiple times.
 *
 * You can return the `AbortUpdate` symbol to cancel the operation and
 * return nothing.
 *
 * @param id ID of the model to create or update
 * @param updateFn Function called to update the model. Should return the
 * model after making modifications to it.
 * @param options Call options
 */
export function createOrUpdate<T extends { id: string }, TCtor extends ModelConstructor<T>>(
  partition: Partition<T, TCtor>,
  id: string,
  updateFn: (
    previous: InstanceType<TCtor> | undefined,
  ) => Thenable<InstanceType<TCtor> | undefined>,
  options?: IOptions<InstanceType<TCtor>>,
): Promise<InstanceType<TCtor> | undefined>;

export async function createOrUpdate<T extends { id: string }, TCtor extends ModelConstructor<T>>(
  partition: Partition<T, TCtor>,
  id: string,
  updateFn: (
    previous: InstanceType<TCtor> | undefined,
  ) => Thenable<InstanceType<TCtor> | undefined>,
  { initialValue, retries = 3, mustFind = false, ...reqOps }: IOptions<InstanceType<TCtor>> = {},
): Promise<InstanceType<TCtor> | undefined> {
  for (let i = 0; ; i++) {
    let model = initialValue;
    if (!model) {
      model = await (mustFind ? partition.find(id, reqOps) : partition.maybeFind(id, reqOps));
    }

    const updated = await updateFn(model);
    if (!updated) {
      return undefined;
    }

    try {
      await updated.save(reqOps, partition.container);
      return updated;
    } catch (e) {
      if ((e.code === 412 || e.code === 409) && i < retries) {
        // etag precondition failed
        initialValue = undefined;
        continue;
      }

      throw e;
    }
  }
}
