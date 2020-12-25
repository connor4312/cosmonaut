import { GeospatialType } from '@azure/cosmos';
import { asType, createSchema } from './schema';

describe('schema', () => {
  const makeTestSchema = () =>
    createSchema('users')
      .field('username', asType<string>())
      .field('favoriteColors', asType<string[]>())
      .field('favoriteCities', asType<{ name: string; country: string }[]>())
      .field('address', asType<{ street: string; postal: number }>());
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
    });

    expect(schema.enableTtlWithoutDefault().definition).toEqual({
      id: 'users',
      defaultTtl: -1,
    });

    expect(schema.ttl(1234).definition).toEqual({
      id: 'users',
      defaultTtl: 1234,
    });
  });

  it('removeFromIndex', () => {
    const schema = makeTestSchema();
    expect(schema.removeAllFromIndex().definition).toEqual({
      id: 'users',
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
      uniqueKeyPolicy: { uniqueKeys: [{ paths: ['/username'] }] },
    });

    expect(
      schema.unique('/username').unique('/address/postal', '/address/street').definition,
    ).toEqual({
      id: 'users',
      uniqueKeyPolicy: {
        uniqueKeys: [{ paths: ['/username'] }, { paths: ['/address/postal', '/address/street'] }],
      },
    });
  });

  it('partitionKey', () => {
    const schema = makeTestSchema();
    expect(schema.partitionKey('/username').definition).toEqual({
      id: 'users',
      partitionKey: { paths: ['/username'] },
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
      conflictResolutionPolicy: { conflictResolutionPath: '/username' },
    });
  });

  it('setGeospatialConfig', () => {
    const schema = makeTestSchema();
    expect(schema.setGeospatialConfig(GeospatialType.Geography).definition).toEqual({
      id: 'users',
      geospatialConfig: { type: GeospatialType.Geography },
    });
  });
});
