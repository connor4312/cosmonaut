import type * as Cosmos from '@azure/cosmos';
import { assertContainer, BaseModel, ConstructorFor, ModelConstructor } from './baseModel';
import { Container } from './container';
import { Partition } from './partition';
import { Schema } from './schema';

/**
 * Creates a class that represents the provided schema. You can use class
 * standalone if you don't need any other methods:
 *
 * ```ts
 * const User = Model(userSchema);
 * const user = new User();
 * user.username = 'connor4312';
 * await user.save();
 * ```
 *
 * ...or extend it to add custom functionality:
 *
 * ```ts
 * class User extends Model(userSchema) {
 *   // e.g. overriding a lifecycle hook
 *   beforePersist(password: string) {
 *     if (this.isDirty('password')) {
 *       this.password = hash(password);
 *     }
 *   }
 * }
 * ```
 */
export const Model = <T extends { id: string }>(schema: Schema<T>) => {
  const ActualModel = class extends BaseModel<T> {
    public readonly schema = schema;

    public readonly partition: (
      container?: Cosmos.Container,
    ) => Partition<T, ConstructorFor<T, this>> = (container = assertContainer(this)) =>
      new Partition(
        container,
        this.constructor as ConstructorFor<T, this>,
        schema,
        this.partitionKey(),
      );

    /**
     * Starts running an operation for an item in a partition.
     */
    public static partition<TCtor extends ModelConstructor<T>>(
      this: TCtor,
      partitionKey: string | number,
      container = assertContainer(this),
    ): Partition<T, TCtor> {
      return new Partition<T, TCtor>(container, this, schema, partitionKey);
    }

    /**
     * Starts running an operation for an item in a partition.
     */
    public static container(container = assertContainer(this)) {
      return new Container(this.schema, container);
    }

    /**
     * Original schema for the model. Note that this is immutable.
     */
    public static readonly schema = schema;
  };

  for (const [key] of Object.entries(schema.schemaMap)) {
    Object.defineProperty(ActualModel.prototype, key, {
      get() {
        return this.props[key];
      },
      set(value) {
        this.props[key] = value;
      },
      enumerable: true,
      configurable: false,
    });
  }

  return ActualModel;
};
