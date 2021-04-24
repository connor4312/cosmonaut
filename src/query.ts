import type * as Cosmos from '@azure/cosmos';
import { ModelConstructor } from './baseModel';

/**
 * Template literal tag function that produces a Cosmos DB query. For example:
 *
 * ```
 * User.query(sql`SELECT users.* FROM users WHERE users.username = ${username}`)
 * ```
 *
 * In this case, `${username}` is correctly extracted to a parameter. Useful
 * for making security auditors' hearts skip a beat.
 */
export const sql = (
  parts: TemplateStringsArray,
  ...params: Cosmos.JSONValue[]
): Cosmos.SqlQuerySpec => {
  const args = new Map<Cosmos.JSONValue, string>();
  let query = '';

  for (let i = 0; i < params.length; i++) {
    query += parts[i];

    let paramName = args.get(params[i]);
    if (paramName === undefined) {
      paramName = `@arg${i}`;
      args.set(params[i], paramName);
    }

    query += paramName;
  }

  query += parts[parts.length - 1];

  return { query, parameters: Array.from(args, ([value, name]) => ({ value, name })) };
};

/**
 * Type describing the Cosmos DB QueryIterator. A mapped type here is used
 * so that we can implement the interface with our custom mapped type.
 */
export type QueryIterator<T> = { [K in keyof Cosmos.QueryIterator<T>]: Cosmos.QueryIterator<T>[K] };

const collectionNameRe = /\$self/g;

/**
 * The Query is a helper for running queries in a Cosmos DB collection. It can
 * be acquired from {@link Partition.query} or the static `Model.crossPartitionQuery`
 * method.
 */
export class Query<T extends { id: string }, TCtor extends ModelConstructor<T>> {
  /**
   * @hidden
   */
  constructor(
    public readonly container: Cosmos.Container,
    public readonly ctor: TCtor,
    private readonly collectionName: string,
    private readonly partitionKey?: string | number,
  ) {}

  /**
   * Returns the query plan for the SQL query.
   */
  public plan(query: Cosmos.SqlQuerySpec) {
    return this.container.getQueryPlan(query);
  }

  /**
   * Executs the query. This returns the raw response and definitions.
   * You can use the {@link sql} tagged template literal for easy querying,
   * and you can use `$self` placeholder in the string to refer to the
   * current collection.
   * @param TOut Shape of returned data, defaults to the interface on the model
   */
  public raw<TOut = T>(
    spec: Cosmos.SqlQuerySpec | string,
    options?: Cosmos.FeedOptions,
  ): QueryIterator<TOut> {
    if (typeof spec === 'string') {
      spec = { query: spec };
    }

    collectionNameRe.lastIndex = 0;

    return this.container.items.query<TOut>(
      {
        query: spec.query.replace(collectionNameRe, this.collectionName),
        parameters: spec.parameters,
      },
      {
        partitionKey: this.partitionKey,
        ...options,
      },
    );
  }

  /**
   * Runs the query and returns its output in fulfilled models.
   * You can use the {@link sql} tagged template literal for easy querying,
   * and you can use `$self` placeholder in the string to refer to the
   * current collection.
   *
   * ```ts
   * const r = User.crossPartitionQuery().run(
   *  sql`SELECT c.* FROM $self c WHERE username = ${name}`);
   *
   * for await (const { resources } of r.getAsyncIterator()){
   *   for (const model of resources) {
   *     model.coolness++;
   *     await model.save();
   *   }
   * }
   * ```
   */
  public run(
    spec: Cosmos.SqlQuerySpec | string,
    options?: Cosmos.FeedOptions,
  ): QueryIterator<InstanceType<TCtor>> {
    return new MappingQueryIterator<T, InstanceType<TCtor>>(
      t => new this.ctor(t) as InstanceType<TCtor>,
      this.raw<T>(spec, options),
    );
  }
}

class MappingQueryIterator<TIn, TOut> implements QueryIterator<TOut> {
  constructor(private readonly mapFn: (v: TIn) => TOut, private readonly it: QueryIterator<TIn>) {}

  getAsyncIterator(): AsyncIterable<Cosmos.FeedResponse<TOut>> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        for await (const response of self.it.getAsyncIterator()) {
          yield self.mapFeedResponse(response);
        }
      },
    };
  }

  public hasMoreResults(): boolean {
    return this.it.hasMoreResults();
  }

  public async fetchAll(): Promise<Cosmos.FeedResponse<TOut>> {
    return this.mapFeedResponse(await this.it.fetchAll());
  }

  public async fetchNext(): Promise<Cosmos.FeedResponse<TOut>> {
    return this.mapFeedResponse(await this.it.fetchNext());
  }

  public reset(): void {
    return this.it.reset();
  }

  private mapFeedResponse(response: Cosmos.FeedResponse<TIn>) {
    return {
      activityId: response.activityId,
      continuation: response.continuation,
      continuationToken: response.continuationToken,
      hasMoreResults: response.hasMoreResults,
      queryMetrics: response.queryMetrics,
      requestCharge: response.requestCharge,
      resources: response.resources.map(this.mapFn),
    } as Cosmos.FeedResponse<TOut>;
  }
}
