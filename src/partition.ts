import type * as Cosmos from '@azure/cosmos';
import { ModelConstructor } from './baseModel';
import { CosmosError } from './errors';
import { Query } from './query';
import { BasicSchema, transformFromDatabase } from './schema';
import { IResourceResponse, mapCosmosResourceResponse } from './types';

export class Partition<T extends { id: string }, TCtor extends ModelConstructor<T>> {
  /**
   * @hidden
   */
  constructor(
    public readonly container: Cosmos.Container,
    public readonly ctor: TCtor,
    private readonly schema: BasicSchema<T>,
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
   * Runs a query in the partition.
   */
  public get query() {
    return new Query<T, TCtor>(this.container, this.ctor, this.schema.id, this.partitionKey);
  }

  /**
   * Looks up a model by ID.
   */
  public async find(id: string, options?: Cosmos.RequestOptions): Promise<InstanceType<TCtor>> {
    return this.findWithDetails(id, options).then(r => r.resource);
  }

  /**
   * Looks up a model by ID, including the original resource metadata.
   */
  public async findWithDetails(
    id: string,
    options?: Cosmos.RequestOptions,
  ): Promise<IResourceResponse<InstanceType<TCtor>>> {
    const response = await this.container.item(id, this.partitionKey).read(options);
    if (response.resource === undefined) {
      throw new CosmosError({
        ...response,
        code: response.statusCode,
        substatus: response.substatus,
        activityId: response.activityId,
        headers: response.headers,
      });
    }

    return mapCosmosResourceResponse(
      response,
      new this.ctor(transformFromDatabase(this.schema, response.resource)) as InstanceType<TCtor>,
    );
  }

  /**
   * Deletes a model by ID.
   */
  public async delete(id: string, options?: Cosmos.RequestOptions) {
    return this.container.item(id, this.partitionKey).delete<T>(options);
  }
}
