import { assertContainer, BaseModel, ModelConstructor } from './baseModel';
import { ICreateOrUpdateOptions, Partition } from './partition';
import { AbortUpdate, Thenable } from './types';

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
 * You can return the `AbortUpdate` symbol to cancel the operation.
 *
 * @param updateFn Function called to update the model. Should return the
 * model after making modifications to it.
 * @param options Call options
 */
export async function update<M extends BaseModel<any>>(
  model: M,
  updateFn: (previous: M) => Thenable<void | typeof AbortUpdate>,
  options?: ICreateOrUpdateOptions<never>,
  container = assertContainer(model),
): Promise<M> {
  const result = await createOrUpdate(
    model.partition(container),
    model.id,
    async m => {
      model.props = m!;
      const result = await updateFn(model);
      return result === AbortUpdate ? AbortUpdate : model;
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
  options?: ICreateOrUpdateOptions<InstanceType<TCtor>>,
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
  ) => Thenable<InstanceType<TCtor> | typeof AbortUpdate>,
  options?: ICreateOrUpdateOptions<InstanceType<TCtor>>,
): Promise<InstanceType<TCtor> | undefined>;

export async function createOrUpdate<T extends { id: string }, TCtor extends ModelConstructor<T>>(
  partition: Partition<T, TCtor>,
  id: string,
  updateFn: (
    previous: InstanceType<TCtor> | undefined,
  ) => Thenable<InstanceType<TCtor> | typeof AbortUpdate>,
  {
    initialValue,
    retries = 3,
    mustFind = false,
    ...reqOps
  }: ICreateOrUpdateOptions<InstanceType<TCtor>> = {},
): Promise<InstanceType<TCtor> | undefined> {
  for (let i = 0; ; i++) {
    let model = initialValue;
    if (!model) {
      model = await (mustFind ? partition.find(id, reqOps) : partition.maybeFind(id, reqOps));
    }

    const updated = await updateFn(model);
    if (updated === AbortUpdate) {
      return undefined;
    }

    try {
      await updated.save(reqOps, partition.container);
      return updated;
    } catch (e) {
      if (e.code === 412 && i < retries) {
        // etag precondition failed
        initialValue = undefined;
        continue;
      }

      throw e;
    }
  }
}
