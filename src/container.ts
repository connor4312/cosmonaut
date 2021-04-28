import type * as Cosmos from '@azure/cosmos';
import { BasicSchema } from './schema';

/**
 * The Container provides an interface for accessing operations dealing
 * with the container schema. It can conventially be retrieved from the
 * `Model.container()` method, but you can also instantiate it manually.
 */
export class Container<T> {
  constructor(
    private readonly schema: BasicSchema<T>,
    public readonly instance: Cosmos.Container,
  ) {}

  /**
   * Creates the container for the model.
   */
  public create(options?: Cosmos.RequestOptions) {
    return this.instance.database.containers.createIfNotExists(this.schema.definition, options);
  }

  /**
   * Creates the container for the model.
   */
  public createIfNotExists(options?: Cosmos.RequestOptions) {
    return this.instance.database.containers.createIfNotExists(this.schema.definition, options);
  }

  /**
   * Replace the container's definition.
   */
  public replace(options?: Cosmos.RequestOptions) {
    return this.instance.replace(this.schema.definition, options);
  }

  /**
   * Delete the container.
   */
  public delete(options?: Cosmos.RequestOptions) {
    return this.instance.delete(options);
  }
}
