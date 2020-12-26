import type * as Cosmos from '@azure/cosmos';
import { assertContainer, BaseModel, IModelCtor } from './baseModel';
import { AbortUpdate, ICreateOrUpdateOptions, Partition } from './partition';
import { lookupCosmosPath, Schema } from './schema';
import { Thenable } from './types';

export interface IActualModelCtor<T> extends IModelCtor<T> {
  partition(partitionKey: string | number, container?: Cosmos.Container): Partition<BaseModel<T>>;
}

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
    /**
     * Starts running an operation for an item in a partition.
     */
    public static partition<T extends ActualModel>(
      this: IModelCtor<T>,
      partitionKey: string | number,
      container = assertContainer(this),
    ) {
      return new Partition(container, this, partitionKey);
    }

    /**
     * Gets the value for the partition key in the current model.
     */
    public get partitionKey() {
      const pkPath = schema.definition.partitionKey;
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

    public static readonly schema = schema;

    /**
     * Updates a model using the given function. The function will
     * be retried automaticaly in case a conflict happens, so could be called
     * multiple times.
     *
     * @param updateFn Function called to update the model. Should return the
     * model after making modifications to it.
     * @param options Call options
     */
    public async updateUsing(
      updateFn: (previous: this) => Thenable<this>,
      options?: ICreateOrUpdateOptions<this>,
    ): Promise<this>;

    /**
     * Updates a model using the given function. The function will
     * be retried automaticaly in case a conflict happens, so could be called
     * multiple times.
     *
     * You can return the `AbortUpdate` symbol to cancel the operation and
     * return nothing.
     *
     * @param updateFn Function called to update the model. Should return the
     * model after making modifications to it.
     * @param options Call options
     */
    public async updateUsing(
      updateFn: (previous: this) => Thenable<this | typeof AbortUpdate>,
      options?: ICreateOrUpdateOptions<this>,
    ): Promise<this>;

    public async updateUsing(
      updateFn: (previous: this) => Thenable<this | typeof AbortUpdate>,
      options?: ICreateOrUpdateOptions<this>,
    ): Promise<this> {
      const ctor = this.constructor as IActualModelCtor<T>;
      const updated = await ctor.partition(this.partitionKey).createOrUpdateUsing(
        this.props.id,
        async m => {
          const result = await updateFn(m as this);
          if (result !== AbortUpdate) {
            await this.beforePersist();
            await this.beforeUpdate();
          }

          return result;
        },
        { ...options, initialValue: this, mustFind: true },
      );

      this.props = (updated as ActualModel).props;
      await this.afterPersist();
      await this.afterUpdate();

      return this;
    }
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

  return (ActualModel as unknown) as IActualModelCtor<T>;
};
