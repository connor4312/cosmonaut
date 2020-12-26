import type * as Cosmos from '@azure/cosmos';
import { BaseModel, IModelCtor } from './baseModel';
import { IResourceResponse, mapCosmosResourceResponse, Thenable } from './types';

/**
 * Can be returned from {@link Partition.createOrUpdateUsing} to cancel the
 * update.
 */
export const AbortUpdate = Symbol('AbortUpdate');

export interface ICreateOrUpdateOptions<T> extends Cosmos.RequestOptions {
  initialValue?: T;
  retries?: number;
  mustFind?: boolean;
}

export class Partition<T extends BaseModel<unknown>> {
  constructor(
    private readonly container: Cosmos.Container,
    private readonly ctor: IModelCtor<T>,
    private partitionKey: string | number,
  ) {}

  /**
   * Looks up a model by ID, returning undefined if it didn't exist.
   */
  public async maybeFind(id: string, options?: Cosmos.RequestOptions) {
    try {
      return await this.find(id, options);
    } catch (e) {
      if (e.code === 404) {
        return undefined;
      }

      throw e;
    }
  }

  /**
   * Looks up a model by ID.
   */
  public async find(id: string, options?: Cosmos.RequestOptions) {
    return this.findWithDetails(id, options).then(r => r.resource);
  }

  /**
   * Looks up a model by ID, including the original resource metadata.
   */
  public async findWithDetails(
    id: string,
    options?: Cosmos.RequestOptions,
  ): Promise<IResourceResponse<T>> {
    const response = await this.container.item(id, this.partitionKey).read(options);
    const model = new this.ctor(response.resource);
    return mapCosmosResourceResponse(response, model);
  }

  /**
   * Looks deletes a model by ID.
   */
  public async delete(id: string, options?: Cosmos.RequestOptions) {
    return this.container.item(id, this.partitionKey).delete(options);
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
  public createOrUpdateUsing(
    id: string,
    updateFn: (previous: T | undefined) => Thenable<T>,
    options?: ICreateOrUpdateOptions<T>,
  ): Promise<T>;

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
  public createOrUpdateUsing(
    id: string,
    updateFn: (previous: T | undefined) => Thenable<T | typeof AbortUpdate>,
    options?: ICreateOrUpdateOptions<T>,
  ): Promise<T | undefined>;

  public async createOrUpdateUsing(
    id: string,
    updateFn: (previous: T | undefined) => Thenable<T | typeof AbortUpdate>,
    { initialValue, retries = 3, mustFind = false, ...reqOps }: ICreateOrUpdateOptions<T> = {},
  ): Promise<T | undefined> {
    for (let i = 0; ; i++) {
      let model = initialValue;
      if (!model) {
        model = await (mustFind ? this.find(id, reqOps) : this.maybeFind(id, reqOps));
      }

      const updated = await updateFn(model);
      if (updated === AbortUpdate) {
        return undefined;
      }

      try {
        await updated.save(reqOps, this.container);
        return model;
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
}
