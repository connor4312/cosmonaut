import type * as Cosmos from '@azure/cosmos';
import { Container } from './container';
import { AbortUpdate, ICreateOrUpdateOptions, Partition } from './partition';
import { lookupCosmosPath, Schema } from './schema';
import { mapCosmosResourceResponse, Thenable } from './types';

export interface IModelCtor<T extends { id: string }> {
  new (props: T & Partial<Cosmos.Resource>): BaseModel<T> & T;

  /**
   * Updates or creats a model using the given function. The function will
   * be retried automaticaly in case a conflict happens, so could be called
   * multiple times.
   *
   * You should either make changes to the model in the callback, or create
   * and return a new instance of the model.
   *
   * You can return the `AbortUpdate` symbol to cancel the operation.
   *
   * @param updateFn Function called to update or create a model.
   * @param options Call options
   */
  createOrUpdateUsing<TCtor extends IModelCtor<T>>(
    this: TCtor,
    id: string,
    partitionKey: string | number,
    updateFn: (previous: InstanceType<TCtor> | undefined) => Thenable<InstanceType<TCtor>>,
    options?: ICreateOrUpdateOptions<InstanceType<TCtor>>,
  ): Promise<InstanceType<TCtor>>;

  /**
   * Updates or creats a model using the given function. The function will
   * be retried automaticaly in case a conflict happens, so could be called
   * multiple times.
   *
   * You should either make changes to the model in the callback, or create
   * and return a new instance of the model.
   *
   * You can return the `AbortUpdate` symbol to cancel the operation.
   *
   * @param updateFn Function called to update or create a model.
   * @param options Call options
   */
  createOrUpdateUsing<TCtor extends IModelCtor<T>>(
    this: TCtor,
    id: string,
    partitionKey: string | number,
    updateFn: (
      previous: InstanceType<TCtor> | undefined,
    ) => Thenable<InstanceType<TCtor> | typeof AbortUpdate>,
    options?: ICreateOrUpdateOptions<InstanceType<TCtor>>,
  ): Promise<InstanceType<TCtor> | undefined>;

  /**
   * Starts running an operation for an item in a partition.
   */
  partition(partitionKey: string | number, container?: Cosmos.Container): Partition<T>;

  /**
   * Starts running an operation for an item in a partition.
   */
  container(container?: Cosmos.Container): Container<T>;

  /**
   * Collection schema.
   */
  schema: Schema<T>;

  /**
   * Default number of retries to make when saving a document using
   * `createOrUpdateUsing` and similar methods.
   */
  defaultConflictRetries: number;

  /**
   * Associated Cosmos container.
   */
  cosmosContainer?: Cosmos.Container;

  /**
   * Associated Cosmos DB database.
   */
  cosmosDb?: Cosmos.Database;
}

export abstract class BaseModel<T extends { id: string }> {
  /**
   * Gets the schema that defines this collection and model.
   */
  protected declare schema: Schema<T>;

  /**
   * Gets a partition accessor for the colleciton.
   */
  protected declare partition: (container: Cosmos.Container) => Partition<T>;

  /**
   * Default container for the model. This can be populated by hand, or by
   * the `connectModels()` helper function.
   */
  public static cosmosDb?: Cosmos.Database;

  /** @see IBaseModelCtor.defaultConflictRetries */
  public static defaultConflictRetries = 3;

  /** @see IBaseModelCtor.createOrUpdateUsing */
  public static async createOrUpdateUsing<T extends { id: string }, TCtor extends IModelCtor<T>>(
    this: TCtor,
    id: string,
    partitionKey: string | number,
    updateFn: (
      previous: InstanceType<TCtor> | undefined,
    ) => Thenable<InstanceType<TCtor> | typeof AbortUpdate>,
    options?: ICreateOrUpdateOptions<InstanceType<TCtor>>,
  ): Promise<InstanceType<TCtor> | undefined> {
    const created = await this.partition(partitionKey).createOrUpdateUsing(
      id,
      async m => {
        const result = await updateFn(m ? (new this(m) as InstanceType<TCtor>) : undefined);
        if (result === AbortUpdate) {
          return result;
        }

        await result.beforePersist();

        if (m) {
          await result.beforeCreate();
        } else {
          await result.beforeUpdate();
        }

        return result;
      },
      { ...options, mustFind: true },
    );

    return created as InstanceType<TCtor> | undefined;
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

  constructor(protected props: T & Partial<Cosmos.Resource>) {}

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
  public async updateUsing(
    updateFn: (previous: this) => Thenable<this | typeof AbortUpdate>,
    options?: ICreateOrUpdateOptions<this>,
    container = assertContainer(this),
  ): Promise<this> {
    const updated = await this.partition(container).createOrUpdateUsing(
      this.props.id,
      async m => {
        this.props = m!;
        const result = await updateFn(this);
        if (result === AbortUpdate) {
          return result;
        }

        await this.beforePersist();
        await this.beforeUpdate();
        return result;
      },
      { ...options, initialValue: this.props, mustFind: true },
    );

    if (!updated) {
      return this;
    }

    this.props = (updated as this).props;
    await this.afterPersist();
    await this.afterUpdate();

    return this;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const assertContainer = (t: any): Cosmos.Container => {
  if (t instanceof BaseModel) {
    t = t.constructor as IModelCtor<{ id: string }>;
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
