import type * as Cosmos from '@azure/cosmos';

export interface ISchemaField {
  partitionKey?: boolean;
}

type SchemaMap<T> = { [key in keyof T]: ISchemaField };

// Dangerous types lie ahead. This place is not a place of honor. No highly
// esteemed deed is commemorated here. Nothing valued is here.

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
export type CosmosIndexPath<T> = CosmosIndexPathImpl<Required<T>, keyof T> | '/*';

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
export type CosmosSimplePath<T> = CosmosSimplePathImpl<Required<T>, keyof T>;

/**
 * Helper that extracts the interface a given schema.
 *
 * ```ts
 * type User = InterfaceForSchema<typeof userCollection>;
 *
 * const user: User = {
 *   username: 'Connor'
 * };
 * ```
 */
export type InterfaceForSchema<T> = T extends BasicSchema<infer I> ? I : never;

/**
 * Basic, static schema object that can be used to create a class instance. The
 * presence of this is purely to have a static version without the typed
 * strings, since that seems to lead quickly to "Type instantiation is
 * excessively deep and possibly infinite.ts(2589)" errors, at least
 * as of TS 4.3.0-beta.
 */
export class BasicSchema<T> {
  constructor(
    public readonly schemaMap: SchemaMap<T>,
    public readonly definition: Cosmos.ContainerRequest & {
      partitionKey?: Cosmos.PartitionKeyDefinition;
    },
  ) {}

  /**
   * Gets the ID of the Cosmos DB container.
   */
  public get id() {
    return this.definition.id!;
  }
}

/**
 * The Schema describes a collection in Cosmos DB. It's a fluent-style builder
 * where you define all the fields, which are passed into the {@link Model}.
 * For a fully-type TypeScript consumer, you could provide:
 *
 * ```ts
 * import { createSchema, asType } from 'cosmonaut';
 *
 * const schema = createSchema('users')
 *   // note that IDs are defined implicity:
 *   .partitionKey('/id')
 *   // the "asType" helper provides type information to the type system.
 *   .field('username', asType<string>())
 *   .field('favoriteColors', asType<string[]>())
 *   .field('favoriteCities', asType<{ name: string; country: string }[]>())
 *   .field('address', asType<{ street: string; postal: number }>())
 * ```
 */
export class Schema<T = { id: string }> extends BasicSchema<T> {
  /**
   * Adds a new field to the schema.
   * @param name the name of the field
   * @param fieldConfig optional configuration for the field
   * @returns the modified schema
   */
  public field<K extends string>(
    name: K,
    fieldConfig?: ISchemaField,
  ): Schema<T & { [K_ in K]?: unknown }>;

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
  ): Schema<
    TField extends OptionalType<infer TConcrete>
      ? T & { [K_ in K]?: TConcrete }
      : T & { [K_ in K]: TField }
  >;

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
  ) {
    const config: ISchemaField =
      !!typeOrConfig && !(typeOrConfig instanceof AsType) ? typeOrConfig : fieldConfig ?? {};
    const merged = {
      ...this.schemaMap,
      [name]: config,
    } as SchemaMap<
      TField extends OptionalType<infer TConcrete>
        ? T & { [K_ in K]?: TConcrete }
        : T & { [K_ in K]: TField }
    >;

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
  public partitionKey(path: CosmosSimplePath<T>, partitionKeyCanBeLong = false) {
    return new Schema(this.schemaMap, {
      ...this.definition,
      partitionKey: {
        paths: [path],
        version: partitionKeyCanBeLong ? 2 : 1,
      },
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

class OptionalType<T> {
  declare value: T;
  declare optional: true;
}

class AsType<T> {
  declare value: T;

  public optional() {
    return new AsType<OptionalType<T>>();
  }
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
