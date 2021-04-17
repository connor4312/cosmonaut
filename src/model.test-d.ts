import { expectType } from 'tsd';
import { exampleUser, User } from './testUtils';

(async () => {
  expectType<User>(await User.partition('a').find('id'));

  //@ts-expect-error
  new User({});

  //@ts-expect-error
  new User({ id: 1234, favoriteColors: [], username: 'Connor' });

  new User({
    id: '',
    favoriteColors: [],
    username: 'Connor',
    favoriteCities: [{ country: 'a', name: 'b' }],
  });

  new User({
    id: '',
    favoriteColors: [],
    username: 'Connor',
    //@ts-expect-error
    favoriteCities: [{ country: 'a', name: 'b', invalid: 3 }],
  });

  expectType<string>(exampleUser.id);
  expectType<string>(exampleUser.props.username);
})();
