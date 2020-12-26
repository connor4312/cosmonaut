import type * as Cosmos from '@azure/cosmos';
import { mapCosmosResourceResponse } from './types';

export interface IModelCtor<T> {
  new (props: any): T;
  defaultConflictRetries: number;
  container?: Cosmos.Container;
}

export abstract class BaseModel<T> {
  /**
   * Default container for the model. This can be populated by hand, or by
   * the `connectModels()` helper function.
   */
  public static container?: Cosmos.Container;

  /**
   * Default number of retries to make when saving a document using
   * `createOrUpdateUsing` and similar methods.
   */
  public static defaultConflictRetries = 3;

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
    const response = await container.items.create(this.props, options);
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
    const response = await container.items.create(this.props, {
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
}

export const assertContainer = (t: IModelCtor<unknown> | BaseModel<unknown>) => {
  if (t instanceof BaseModel) {
    t = t.constructor as IModelCtor<unknown>;
  }

  if (!t.container) {
    throw new Error(
      `No database connection is available in the model. ` +
        'Either pass in the database to the function call, or use the `connectModels()` method.',
    );
  }

  return t.container;
};
