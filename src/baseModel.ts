import type * as Cosmos from '@azure/cosmos';
import Ajv from 'ajv';
import { Partition } from './partition';
import {
  BasicSchema,
  lookupCosmosPath,
  transformFromDatabase,
  transformToDatabase,
} from './schema';
import { mapCosmosResourceResponse } from './types';
import { mustValidate, once } from './util';

export type ConstructorFor<TProps, TThis> = { new (props: TProps): TThis };

export interface ModelConstructor<T extends { id: string }> {
  new (props: T & Partial<Cosmos.Resource>): BaseModel<T>;
}

export interface ISaveOptions extends Cosmos.RequestOptions {
  /**
   * Whether to run validation on this operation, defaults to true.
   */
  validate?: boolean;

  /**
   * Whether to force the operation, ignoring any possible conflicting writes.
   */
  force?: boolean;
}

export interface IDeleteOptions extends Cosmos.RequestOptions {
  /**
   * Whether to force the operation, ignoring any possible conflicting writes.
   */
  force?: boolean;
}

/**
 * The BaseModel is the foundational type for models, which is returned by
 * a call to {@link Model}. It provides lifecycle hooks (which can be
 * overridden) and methods for {@link BaseModel.save | saving},
 * {@link BaseModel.delete | deleting}, and
 * {@link BaseModel.validate | validating} a document in Cosmos DB.
 *
 * To look up a model, you'll usually use the methods on `Model.partition()`,
 * or `Model.crossPartitionQuery()`.
 */
export abstract class BaseModel<T extends { id: string }> {
  /**
   * Schema for this model.
   */
  public abstract schema: BasicSchema<T>;

  /**
   * Gets a partition accessor for the collection. See {@link Partition} for
   * things you can do on the model.
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

  /**
   * Instance of [ajv](https://ajv.js.org/) use for validation. You can modify
   * or replace this as needed, to add custom validators for example.
   * Modifications must happen before you start using models, since validation
   * schemas will be compiled and cached once they're used.
   */
  public static ajv = new Ajv();

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
   * Lifecycle hook called before an existing model is deleted.
   */
  public async beforeDelete() {
    // no-op
  }

  /**
   * Lifecycle hook called after an existing model is deleted.
   */
  public async afterDelete() {
    // no-op
  }

  /**
   * Validates the current set of properties on the model.
   * @throws Ajv.ValidationError
   */
  public validate() {
    mustValidate(this.getValidateFunction(), transformToDatabase(this.schema, this.props));
  }

  /**
   * Creates the item, if it doesn't exist. If it does, an error is thrown.
   */
  public async create(
    { validate, force, ...reqOpts }: ISaveOptions = {},
    container = assertContainer(this),
  ) {
    await this.beforeCreate();
    await this.beforePersist();

    const toCreate = transformToDatabase(this.schema, this.props);
    if (validate !== false) {
      mustValidate(this.getValidateFunction(), toCreate);
    }

    const response = force
      ? await container.items.upsert(toCreate as Cosmos.ItemDefinition, reqOpts)
      : await container.items.create(toCreate as Cosmos.ItemDefinition, reqOpts);
    this.props = transformFromDatabase(this.schema, response.resource!);

    await this.afterPersist();
    await this.afterCreate();

    return mapCosmosResourceResponse(response, this);
  }

  /**
   * Persists item updates to the database. This uses etags to avoid a
   * conflict, if the item was originally retrieved from the database.
   * This can throw an error if another process made and update in
   * the meantime. To avoid this behavior, pass `{ overwrite: true }`.
   */
  public async update(
    { validate, force, ...reqOpts }: ISaveOptions = {},
    container = assertContainer(this),
  ) {
    await this.beforeUpdate();
    await this.beforePersist();

    const toSave = transformToDatabase(this.schema, this.props);
    if (validate !== false) {
      mustValidate(this.getValidateFunction(), toSave);
    }

    const response = await container.item(this.id).replace(toSave as Cosmos.ItemDefinition, {
      accessCondition:
        this.props._etag !== undefined && !force
          ? {
              type: 'IfMatch',
              condition: this.props._etag,
            }
          : undefined,
      ...reqOpts,
    });
    this.props = transformFromDatabase(this.schema, response.resource!);

    await this.afterPersist();
    await this.afterUpdate();

    return mapCosmosResourceResponse(response, this);
  }

  public async delete(
    { force, ...reqOpts }: IDeleteOptions = {},
    container = assertContainer(this),
  ) {
    if (!force && !this.props._etag) {
      throw new Error(
        `You may only call Model.delete without passing { force: true } on a model that has been read from Cosmos DB and has an _etag.`,
      );
    }
    await this.beforeDelete();

    const response = await container.item(this.id, this.partitionKey()).delete<T>({
      accessCondition:
        this.props._etag !== undefined && !force
          ? {
              type: 'IfMatch',
              condition: this.props._etag,
            }
          : undefined,
      ...reqOpts,
    });

    await this.afterDelete();

    return response;
  }

  /**
   * Safely persists the model -- updating it if it was originally retrieved
   * from the database (provided a model with the ID doesn't already exist) or
   * creating it if not.
   */
  public save(options?: ISaveOptions, container = assertContainer(this)) {
    return this.props._etag ? this.update(options, container) : this.create(options, container);
  }

  /**
   * Gets the value for the partition key in the current model.
   */
  public partitionKey() {
    const pkPath = this.schema.definition.partitionKey;
    if (!pkPath) {
      return '';
    }

    const value = lookupCosmosPath(
      this.props,
      typeof pkPath === 'object' ? pkPath.paths[0] : pkPath,
    );

    if (value === undefined) {
      throw new Error(
        `Partition key was undefined at path ${pkPath} in the model.` +
          'A partition key must always be present.',
      );
    }

    return value as string | number;
  }

  /**
   * Gets the JSON validation function for this model.
   */
  public readonly getValidateFunction = once(() => BaseModel.ajv.compile(this.schema.jsonSchema));
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
