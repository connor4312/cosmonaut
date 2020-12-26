import type * as Cosmos from '@azure/cosmos';

export interface ISchemaField {
  partitionKey?: boolean;
}

export type SchemaMap<T> = { [key in keyof T]: ISchemaField };

const concat = <T>(arr: ReadonlyArray<T> | undefined, ...items: T[]) =>
  arr ? arr.concat(...items) : items;

type Primitive = string | number | boolean;

type CosmosIndexPathImpl<T, K extends keyof T> = K extends string
  ? T[K] extends Primitive
    ? `/${K}/?`
    : T[K] extends Array<infer A>
    ? A extends Primitive
      ? `/${K}/*` | `/${K}/?`
      : `/${K}/[]${CosmosIndexPathImpl<A, keyof A>}`
    : T[K] extends Record<string, unknown>
    ? `/${K}/*` | `/${K}${CosmosIndexPathImpl<T[K], keyof T[K]>}`
    : never
  : never;

/**
 * A generic type that, given an object, produces the types of all valid paths
 * in the object for indexing purposes.
 */
export type CosmosIndexPath<T> = CosmosIndexPathImpl<T, keyof T> | '/*';

type CosmosSimplePathImpl<T, K extends keyof T> = K extends string
  ? T[K] extends Array<unknown>
    ? never
    : T[K] extends Record<string, unknown>
    ? `/${K}${CosmosSimplePathImpl<T[K], keyof T[K]>}`
    : `/${K}`
  : never;

/**
 * A generic type that, given an object, produces the types of all valid paths
 * in the object for unique and partition key constraints.
 */
export type CosmosSimplePath<T> = CosmosSimplePathImpl<T, keyof T>;

export class Schema<T> {
  constructor(
    public readonly schemaMap: SchemaMap<T>,
    public readonly definition: Cosmos.ContainerRequest,
  ) {}

  /**
   * Gets the ID of the Cosmos DB container.
   */
  public get id() {
    return this.definition.id!;
  }

  /**
   * Adds a new field to the schema.
   * @param name the name of the field
   * @param fieldConfig optional configuration for the field
   * @returns the modified schema
   */
  public field<K extends string>(
    name: K,
    fieldConfig?: ISchemaField,
  ): Schema<T & { [K_ in K]: unknown }>;

  /**
   * Adds a new field to the schema.
   * @param name the name of the field
   * @param field type, you can use the `asType<T>()` function
   * to pass this in.
   * @param fieldConfig optional configuration for the field
   * @returns the modified schema
   */
  public field<K extends string, TField>(
    name: K,
    asType: AsType<TField>,
    fieldConfig?: ISchemaField,
  ): Schema<T & { [K_ in K]: TField }>;

  /**
   * Adds a new field to the schema.
   * @param name the name of the field
   * @param fieldConfig optional configuration for the field
   * @returns the modified schema
   */
  public field<K extends string, TField>(
    name: K,
    typeOrConfig?: AsType<TField> | ISchemaField,
    fieldConfig?: ISchemaField,
  ): Schema<T & { [K_ in K]: TField }> {
    const config: ISchemaField =
      !!typeOrConfig && !(typeOrConfig instanceof AsType) ? typeOrConfig : fieldConfig ?? {};
    const merged = {
      ...this.schemaMap,
      [name]: config,
    } as SchemaMap<T & { [K_ in K]: TField }>;

    return new Schema(merged, this.definition);
  }

  /**
   * Updates the default TTL in seconds for the container.
   *  - If undefined, items in the container are not expired (default)
   *  - If set to a positive value, the items expire after the given time
   *  - If set to -1, items will expire but won't have a default ttl.
   */
  public ttl(duration: number | undefined) {
    return new Schema(this.schemaMap, { ...this.definition, defaultTtl: duration });
  }

  /**
   * Enables the TTL without setting a default TTL, equivalent to `.ttl(-1)`.
   * But I have to look that up literally every time, so this is more friendly.
   */
  public enableTtlWithoutDefault() {
    return this.ttl(-1);
  }

  /**
   * Removes all paths from indexing, unless explicitly included. This reduces
   * write charges and would be a sensible behavior for most use cases.
   * Note that unless this is called, all fields are indexed.
   */
  public removeAllFromIndex() {
    return this.removeFromIndex('/*');
  }

  /**
   * Removes the field from being indexed.
   * @see https://docs.microsoft.com/en-us/azure/cosmos-db/index-policy
   */
  public removeFromIndex(...paths: CosmosIndexPath<T>[]) {
    return new Schema(this.schemaMap, {
      ...this.definition,
      indexingPolicy: {
        ...this.definition.indexingPolicy,
        excludedPaths: concat(
          this.definition.indexingPolicy?.excludedPaths,
          ...paths.map(path => ({ path })),
        ),
      },
    });
  }

  /**
   * Adds a path to the index.
   * @param path path to add to the index
   * @param indexes list of indexes to apply
   * @see https://docs.microsoft.com/en-us/azure/cosmos-db/index-policy
   */
  public addToIndex(path: CosmosIndexPath<T>, ...indexes: Cosmos.Index[]) {
    return new Schema(this.schemaMap, {
      ...this.definition,
      indexingPolicy: {
        ...this.definition.indexingPolicy,
        includedPaths: concat(this.definition.indexingPolicy?.includedPaths, { path, indexes }),
      },
    });
  }

  /**
   * Adds the given paths as being unique for the container. Note that unique
   * keys are _per-partition key_.
   * @see https://docs.microsoft.com/en-us/azure/cosmos-db/unique-keys
   */
  public unique(...paths: CosmosSimplePath<T>[]) {
    return new Schema(this.schemaMap, {
      ...this.definition,
      uniqueKeyPolicy: {
        uniqueKeys: concat(this.definition.uniqueKeyPolicy?.uniqueKeys, { paths }),
      },
    });
  }

  /**
   * Sets the given path as forming the partition key.
   *
   * Although the API accepts an array, it is currently documented that it must
   * contain a single value.
   *
   * @see https://docs.microsoft.com/en-us/azure/cosmos-db/partitioning-overview
   */
  public partitionKey(path: CosmosSimplePath<T>) {
    return new Schema(this.schemaMap, {
      ...this.definition,
      partitionKey: path,
    });
  }

  /**
   * Sets the conflict resolution policy for the container.
   * @see https://docs.microsoft.com/en-us/azure/cosmos-db/conflict-resolution-policies
   */
  public setConflictResolution(
    policy: Cosmos.ConflictResolutionPolicy & { conflictResolutionPath?: CosmosSimplePath<T> },
  ) {
    return new Schema(this.schemaMap, {
      ...this.definition,
      conflictResolutionPolicy: policy as Cosmos.ConflictResolutionPolicy,
    });
  }

  /**
   * Updates the geospatial config for the container.
   * @see https://docs.microsoft.com/en-us/azure/cosmos-db/sql-query-geospatial-intro
   */
  public setGeospatialConfig(type: Cosmos.GeospatialType) {
    return new Schema(this.schemaMap, {
      ...this.definition,
      geospatialConfig: { type },
    });
  }

  /**
   * Sets the (per-container) throughput, either in RU/s or an auto-scale
   * configuration.
   * @see https://docs.microsoft.com/en-us/azure/cosmos-db/provision-throughput-autoscale
   * @see https://docs.microsoft.com/en-us/azure/cosmos-db/set-throughput
   */
  public setThroughput(
    throughput:
      | number
      | Pick<Cosmos.ContainerRequest, 'throughput' | 'maxThroughput' | 'autoUpgradePolicy'>,
  ) {
    return new Schema(
      this.schemaMap,
      typeof throughput === 'number'
        ? { ...this.definition, throughput }
        : { ...this.definition, ...throughput },
    );
  }
}

class AsType<T> {
  declare value: T;
}

export const lookupCosmosPath = (object: any, path: string): unknown => {
  for (const part of path.slice(1).split('/')) {
    object = object?.[part];
  }

  return object;
};

export const createSchema = (containerName: string) =>
  new Schema<{ id: string }>({ id: {} }, { id: containerName });

export const asType = <T>() => new AsType<T>();
