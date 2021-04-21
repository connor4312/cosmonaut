import { expectType } from 'tsd';
import * as atomic from './atomic';
import { exampleUser, User } from './testUtils';
import { AbortUpdate } from './types';

(async () => {
  expectType<User>(await atomic.update<User>(exampleUser, () => undefined));

  expectType<User>(
    await atomic.createOrUpdate(User.partition('a'), 'id', async prev => {
      if (!prev) {
        return new User({ id: '1', favoriteColors: new Set(['blue']), username: 'Connor' });
      } else {
        prev.props.username = 'Connor';
        return prev;
      }
    }),
  );

  expectType<User | undefined>(
    await atomic.createOrUpdate(User.partition('a'), 'id', async prev => {
      if (!prev) {
        return AbortUpdate;
      } else {
        prev.props.username = 'Connor';
        return prev;
      }
    }),
  );
})();
