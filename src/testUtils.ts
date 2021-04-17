import { CosmosClient } from '@azure/cosmos';
import cosmosServer from '@zeit/cosmosdb-server';
import * as https from 'https';
import { AddressInfo } from 'net';
import { asType, createSchema, Model } from '.';
import { connectModels } from './baseModel';

export const schema = createSchema('users')
  .partitionKey('/id')
  .field('username', asType<string>())
  .field('favoriteColors', asType<string[]>())
  .field('favoriteCities', asType<{ name: string; country: string }[]>().optional());

export class User extends Model(schema) {
  foo() {
    return '';
  }
}

export const exampleUser = new User({ id: '1', favoriteColors: ['blue'], username: 'Connor' });

export let client: CosmosClient | undefined;

const dbName = 'cosmonauttest';

let server: https.Server | undefined;

export async function setupConnection() {
  if (client) {
    return client;
  }

  server = cosmosServer();
  await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));

  client = new CosmosClient({
    endpoint: `https://127.0.0.1:${(server.address() as AddressInfo).port}`,
    key: 'dummy key',
    agent: new https.Agent({ rejectUnauthorized: false }),
  });

  await client.databases.createIfNotExists({ id: dbName });
  connectModels(client.database(dbName));
  return client;
}

export async function teardownConnection() {
  await new Promise<void>(r => server?.close(() => r()));
  server = undefined;
  client = undefined;
}
