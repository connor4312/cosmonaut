import type * as Cosmos from '@azure/cosmos';
import { assertContainer, BaseModel, IModelCtor } from './baseModel';
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
  class ActualModel extends BaseModel<T> {
    protected readonly schema = schema;
    protected readonly partition = (container: Cosmos.Container) =>
      new Partition<T>(container, this.partitionKey());

    /** See {@link IActualModelCtor.partition} */
    public static partition(partitionKey: string | number, container = assertContainer(this)) {
      return new Partition<T>(container, partitionKey);
    }

    /** See {@link IActualModelCtor.container} */
    public static container(container = assertContainer(this)) {
      return new Container(this.schema, container);
    }

    /**
     * Original schema for the model. Note that this is immutable.
     */
    public static readonly schema = schema;
  }

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

  return (ActualModel as unknown) as IModelCtor<T>;
};
