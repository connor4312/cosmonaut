# Cosmonaut

Cosmonaut is an unofficial (Object Data Mapper) ODM for Cosmos DB. I grew tired of copying a utility library to use between projects. It has a strong emphasis on modularity and type-safety, while also aiming to be pleasant to use for non-TypeScript consumers.

## Quick Example

```ts
import { Model, createSchema, asType } from 'cosmonaut-odm';

// Define a new container in Cosmos DB
const schema = createSchema('users')
  .partitionKey('/id')
  // You give types to the schema via the `asType` helper function
  .field('username', asType<string>())
  // You can pass in a JSON schema used to validate the type in the third argument
  .field('favoriteColors', asType<string[]>(), {
    type: 'array',
    items: { type: 'string', }
    uniqueItems: true,
  });

// Use the `Model` function to create the class encapsulating a schema. You can
// then use and extend this like normal JavaScript classes.
class User extends Model(schema) {}

// Provide the database connection to models. You can also pass this in
// individually to method calls, if you'd like
connectModels(new CosmosClient({ /* ... */ }).database('my-db'));

// Make sure the container exists...
await User.container().createIfNotExists();

// And create a user!
const user = new User({
  id: '42',
  username: 'Connor',
  favoriteColors: ['blue'],
});

// Properties are accessible in the `props` object.
user.props.favoriteColors.push('green');

// Save, delete, and so on.
await user.save();
```

## Features

- [x] Schema builder and typesafe schemas
- [x] Basic object data model
- [x] Atomic operations
- [x] Validation
- [x] Transformation functions
- [x] Query support
- [ ] RU telemetry
- [ ] Pagination helpers
- [ ] 'relationships'

## Concepts

Unlike other TypeScript ORMs/ODMs, we don't use decorators. Decorators can be burdensome or impossible to deal with, especially for vanilla JS consumers and lack type-safety. Instead, the basis of everything is the well-typed "schema" from which the world is derived.

## Documentation

todo

## Contributing

Here's how to run tests:

1. Clone the repo, and run `npm install`
1. In one terminal, run `npm run watch:tsc`
1. In another, you can `npm run test:unit` or `npm run watch:test` to rerun them

By default, it'll run against Vercel's [cosmosdb-server](https://github.com/vercel/cosmosdb-server) implementation. However, you can run it against a local [Cosmos DB emulator](https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator) by running `npm run test:unit:emulator`. This is slower and requires Windows or Windows containers, but is useful to sanity check changes.
