import type * as Cosmos from '@azure/cosmos';
import { Schema } from './schema';

/**
 * The Container provides an interface for accessing operations dealing
 * with the container schema. It can conventially be retrieved from the
 * `Model.container()` method, but you can also instantiate it manually.
 */
export class Container<T> {
  constructor(
    private readonly schema: Schema<T>,
    private readonly container: Cosmos.Container,
  ) {}

  /**
   * Creates the container for the model.
   */
  public create(options?: Cosmos.RequestOptions) {
    return this.container.database.containers.createIfNotExists(this.schema.definition, options);
  }

  /**
   * Creates the container for the model.
   */
  public createIfNotExists(options?: Cosmos.RequestOptions) {
    return this.container.database.containers.createIfNotExists(this.schema.definition, options);
  }

  /**
   * Replace the container's definition.
   */
  public replace(options?: Cosmos.RequestOptions) {
    return this.container.replace(this.schema.definition, options);
  }

  /**
   * Delete the container.
   */
  public delete(options?: Cosmos.RequestOptions) {
    return this.container.delete(options);
  }
}
