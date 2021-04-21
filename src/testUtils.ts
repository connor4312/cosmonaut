import { CosmosClient } from '@azure/cosmos';
import cosmosServer from '@zeit/cosmosdb-server';
import * as https from 'https';
import { AddressInfo } from 'net';
import { asType, createSchema, Model } from '.';
import { connectModels } from './baseModel';
import { Transform } from './schema';

export const schema = createSchema('users')
  .partitionKey('/id')
  .field('username', asType<string>())
  .field('favoriteColors', asType<Set<string>>(), {
    type: 'array',
    maxItems: 3,
    items: { type: 'string' },
    transform: new Transform<string[], Set<string>>(
      stored => new Set(stored),
      app => Array.from(app),
    ),
  })
  .field('favoriteCities', asType<{ name: string; country: string }[]>().optional());

export class User extends Model(schema) {
  foo() {
    return '';
  }
}

export const exampleUser = new User({
  id: '1',
  favoriteColors: new Set(['blue']),
  username: 'Connor',
});

export let client: CosmosClient | undefined;

const dbName = 'cosmonauttest';
const useEmulator = process.env.COSMONAUT_USE_EMULATOR;

let server: https.Server | undefined;

export async function setupConnection() {
  if (client) {
    return client;
  }

  if (useEmulator) {
    client = new CosmosClient({
      endpoint: 'https://localhost:8081/',
      // well-known emulator key:
      key:
        'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',
      agent: new https.Agent({ rejectUnauthorized: false }),
    });
  } else {
    server = cosmosServer();
    await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));

    client = new CosmosClient({
      endpoint: `https://127.0.0.1:${(server.address() as AddressInfo).port}`,
      key: 'dummy key',
      agent: new https.Agent({ rejectUnauthorized: false }),
    });
  }

  await client.databases.createIfNotExists({ id: dbName, throughput: 400 });
  connectModels(client.database(dbName));
  await User.container().createIfNotExists();
  return client;
}

export async function teardownConnection() {
  await User.container().delete();
  await new Promise<void>(r => server?.close(() => r()));
  server = undefined;
  client = undefined;
}
