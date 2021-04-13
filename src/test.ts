import { Model, createSchema, asType } from '.';

const schema = createSchema('users')
  .partitionKey('/id')
  .field('username', asType<string>())
  .field('favoriteColors', asType<string[]>())
  .field('favoriteCities', asType<{ name: string; country: string }[]>().optional());

class User extends Model(schema) {}

const p = User.find('a');
const u = await p.find('f')


const o = await User.createOrUpdateUsing('a', 'b', prev => {
  if (!prev) {
    return new User({});
  } else {
    prev.username = 'foo';
    return prev;
  }
})
