import { GeospatialType } from '@azure/cosmos';
import { asType, createSchema, InterfaceForSchema } from './schema';

describe('schema', () => {
  const makeTestSchema = () =>
    createSchema('users')
      .partitionKey('/id')
      .field('username', asType<string>())
      .field('favoriteColors', asType<string[]>())
      .field('favoriteCities', asType<{ name: string; country: string }[]>())
      .field('address', asType<{ street: string; postal: number }>().optional());

  it('validates index paths', () => {
    const schema = makeTestSchema();

    schema.addToIndex('/*');
    schema.addToIndex('/address/*');
    schema.addToIndex('/address/postal/?');
    schema.addToIndex('/favoriteCities/[]/country/?');
    schema.addToIndex('/favoriteColors/*');
    schema.addToIndex('/username/?');

    // @ts-expect-error
    schema.addToIndex('/invalid');
    // @ts-expect-error
    schema.addToIndex('/favoriteCities/[]');
    // @ts-expect-error
    schema.addToIndex('/favoriteCities/[]/*');
  });

  it('validates simple paths', () => {
    const schema = makeTestSchema();

    schema.unique('/address/postal', '/username');
    // @ts-expect-error
    schema.unique('/username/?');
    // @ts-expect-error
    schema.unique('/invalid');
    // @ts-expect-error
    schema.unique('/favoriteCities/[]/country');
  });

  it('ttl', () => {
    const schema = makeTestSchema();
    expect(schema.definition).toEqual({
      id: 'users',
      partitionKey: { paths: ['/id'], version: 1 },
    });

    expect(schema.enableTtlWithoutDefault().definition).toEqual({
      id: 'users',
      defaultTtl: -1,
      partitionKey: { paths: ['/id'], version: 1 },
    });

    expect(schema.ttl(1234).definition).toEqual({
      id: 'users',
      defaultTtl: 1234,
      partitionKey: { paths: ['/id'], version: 1 },
    });
  });

  it('removeFromIndex', () => {
    const schema = makeTestSchema();
    expect(schema.removeAllFromIndex().definition).toEqual({
      id: 'users',
      partitionKey: { paths: ['/id'], version: 1 },
      indexingPolicy: {
        excludedPaths: [
          {
            path: '/*',
          },
        ],
      },
    });

    expect(schema.removeFromIndex('/address/*').definition).toEqual({
      id: 'users',
      partitionKey: { paths: ['/id'], version: 1 },
      indexingPolicy: {
        excludedPaths: [
          {
            path: '/address/*',
          },
        ],
      },
    });

    expect(schema.removeFromIndex('/address/*').removeFromIndex('/username/?').definition).toEqual({
      id: 'users',
      partitionKey: { paths: ['/id'], version: 1 },
      indexingPolicy: {
        excludedPaths: [
          {
            path: '/address/*',
          },
          {
            path: '/username/?',
          },
        ],
      },
    });
  });

  it('addToIndex', () => {
    const schema = makeTestSchema();
    expect(
      schema.addToIndex('/address/*', {
        dataType: 'String',
        kind: 'Range',
      }).definition,
    ).toEqual({
      id: 'users',
      partitionKey: { paths: ['/id'], version: 1 },
      indexingPolicy: {
        includedPaths: [
          {
            path: '/address/*',
            indexes: [
              {
                dataType: 'String',
                kind: 'Range',
              },
            ],
          },
        ],
      },
    });
  });

  it('unique', () => {
    const schema = makeTestSchema();
    expect(schema.unique('/username').definition).toEqual({
      id: 'users',
      partitionKey: { paths: ['/id'], version: 1 },
      uniqueKeyPolicy: { uniqueKeys: [{ paths: ['/username'] }] },
    });

    expect(
      schema.unique('/username').unique('/address/postal', '/address/street').definition,
    ).toEqual({
      id: 'users',
      partitionKey: { paths: ['/id'], version: 1 },
      uniqueKeyPolicy: {
        uniqueKeys: [{ paths: ['/username'] }, { paths: ['/address/postal', '/address/street'] }],
      },
    });
  });

  it('partitionKey', () => {
    expect(makeTestSchema().definition).toEqual({
      id: 'users',
      partitionKey: { paths: ['/id'], version: 1 },
    });
    expect(makeTestSchema().partitionKey('/id', true).definition).toEqual({
      id: 'users',
      partitionKey: { paths: ['/id'], version: 2 },
    });
  });

  it('setConflictResolution', () => {
    const schema = makeTestSchema();
    expect(
      schema.setConflictResolution({
        conflictResolutionPath: '/username',
      }).definition,
    ).toEqual({
      id: 'users',
      partitionKey: { paths: ['/id'], version: 1 },
      conflictResolutionPolicy: { conflictResolutionPath: '/username' },
    });
  });

  it('setGeospatialConfig', () => {
    const schema = makeTestSchema();
    expect(schema.setGeospatialConfig(GeospatialType.Geography).definition).toEqual({
      id: 'users',
      partitionKey: { paths: ['/id'], version: 1 },
      geospatialConfig: { type: GeospatialType.Geography },
    });
  });

  it('extracts schema type', () => {
    const schema = makeTestSchema();
    type User = InterfaceForSchema<typeof schema>;

    const user: User = {
      id: '42',
      username: 'connor',
      favoriteCities: [{ country: 'a', name: 'b' }],
      favoriteColors: ['blue'],
    };

    expect(user).toBeTruthy();
  });
});
