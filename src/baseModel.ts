import type * as Cosmos from '@azure/cosmos';
import { Partition } from './partition';
import { BasicSchema, lookupCosmosPath } from './schema';
import { mapCosmosResourceResponse } from './types';

export type ConstructorFor<TProps, TThis> = { new (props: TProps): TThis };

export interface ModelConstructor<T extends { id: string }> {
  new (props: T & Partial<Cosmos.Resource>): BaseModel<T>;
}

export abstract class BaseModel<T extends { id: string }> {
  /**
   * Schema for this model.
   */
  public abstract schema: BasicSchema<T>;

  /**
   * Gets a partition accessor for the colleciton.
   */
  public abstract partition: (
    container?: Cosmos.Container,
  ) => Partition<T, ConstructorFor<T, this>>;

  /**
   * Default container for the model. This can be populated by hand, or by
   * the `connectModels()` helper function.
   */
  public static cosmosDb?: Cosmos.Database;

  /**
   * Default Cosmos DB container for the model. This can be populated by hand,
   * or by the `connectModels()` helper function.
   */
  public static cosmosContainer?: Cosmos.Container;

  /** @see IBaseModelCtor.defaultConflictRetries */
  public static defaultConflictRetries = 3;

  /**
   * Gets the model ID. This is unique within a Cosmos DB partition.
   */
  public get id() {
    return this.props.id;
  }

  /**
   * Gets the time the model was last updated.
   *
   * This will be undefined if the model was not yet saved and was not
   * loaded from the database.
   */
  public get updatedAt() {
    return this.props._ts && new Date(this.props._ts * 1000);
  }

  /**
   * Gets the etag of the data when it was read.
   *
   * This will be undefined if the model was not yet saved and was not
   * loaded from the database.
   */
  public get etag() {
    return this.props._etag;
  }

  /**
   * Raw model properties. These are also accessible on the instance directly,
   * but you need to manually declare them if you use TypeScript.
   */
  public props: T & Partial<Cosmos.Resource>;

  constructor(props: T & Partial<Cosmos.Resource>) {
    this.props = props;
  }

  /**
   * Lifecycle hook called before the model is persisted. This is called
   * *after* `beforeCreate` or `beforeUpdate`.
   */
  public async beforePersist() {
    // no-op
  }

  /**
   * Lifecycle hook called after the model is successfully persisted. This is
   * called *before* `afterCreate` or `afterUpdate`.
   */
  public async afterPersist() {
    // no-op
  }

  /**
   * Lifecycle hook called before the model is created for the first time.
   */
  public async beforeCreate() {
    // no-op
  }

  /**
   * Lifecycle hook called after the model is created for the first time.
   */
  public async afterCreate() {
    // no-op
  }

  /**
   * Lifecycle hook called before an existing model is updated.
   */
  public async beforeUpdate() {
    // no-op
  }

  /**
   * Lifecycle hook called after an existing model is updated.
   */
  public async afterUpdate() {
    // no-op
  }

  /**
   * Creates the item, if it doesn't exist. If it does, an error is thrown.
   */
  public async create(options?: Cosmos.RequestOptions, container = assertContainer(this)) {
    await this.beforeCreate();
    await this.beforePersist();
    const response = await container.items.create<T>(this.props, options);
    this.props = response.resource!;
    await this.afterPersist();
    await this.afterCreate();

    return mapCosmosResourceResponse(response, this);
  }

  /**
   * Persists item updates to the database. This uses etags to avoid a
   * conflict, if the item was originally retrieved from the database.
   * This can throw an error if another process made and update in
   * the meantime. To avoid this behavior, use {@see updateWithOverwrite}.
   */
  public async update(options?: Cosmos.RequestOptions, container = assertContainer(this)) {
    await this.beforeUpdate();
    await this.beforePersist();
    const response = await container.items.upsert<T>(this.props, {
      accessCondition:
        this.props._etag !== undefined
          ? {
              type: 'IfMatch',
              condition: this.props._etag,
            }
          : undefined,
      ...options,
    });
    this.props = response.resource!;
    await this.afterPersist();
    await this.afterCreate();

    return mapCosmosResourceResponse(response, this);
  }

  /**
   * Persists item updates to the database. In this method, an etag check
   * is not done; the item will be overwritten.
   */
  public async updateWithOverwrite(
    options?: Cosmos.RequestOptions,
    container = assertContainer(this),
  ) {
    return this.update({ ...options, accessCondition: undefined }, container);
  }

  /**
   * Safely persists the model -- updating it if it was originally retrieved
   * from the database (provided a model with the ID doesn't already exist) or
   * creating it if not.
   */
  public save(options?: Cosmos.RequestOptions, container = assertContainer(this)) {
    return this.props._etag ? this.update(options, container) : this.create(options, container);
  }

  /**
   * Gets the value for the partition key in the current model.
   */
  public partitionKey() {
    const pkPath = this.schema.definition.partitionKey;
    if (typeof pkPath !== 'string') {
      return '';
    }

    const value = lookupCosmosPath(this.props, pkPath);
    if (value === undefined) {
      throw new Error(
        `Partition key was undefined at path ${pkPath} in the model.` +
          'A partition key must always be present.',
      );
    }

    return value as string | number;
  }
}

/**
 * Associates the database connection with all models.
 */
export const connectModels = (connection: Cosmos.Database) => {
  BaseModel.cosmosDb = connection;
};

export const assertContainer = (t: any): Cosmos.Container => {
  if (t instanceof BaseModel) {
    t = t.constructor as typeof BaseModel;
  }

  if (!t.cosmosContainer) {
    if (!t.cosmosDb) {
      throw new Error(
        `No database connection is available in the model. ` +
          'Either pass in the container to the function call, or use the `connectModels()` method.',
      );
    }

    t.cosmosContainer = t.cosmosDb.container(t.schema.id);
  }

  return t.cosmosContainer;
};
