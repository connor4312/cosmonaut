import { atomic } from '.';
import { setupConnection, teardownConnection, User } from './testUtils';

describe('atomic', () => {
  beforeAll(async () => {
    await setupConnection();
  });

  afterEach(async () => {
    await User.partition('id-a')
      .delete('id-a')
      .catch(() => undefined);
  });

  afterAll(async () => {
    await teardownConnection();
  });

  describe('createOrUpdate', () => {
    it('creates on new', async () => {
      const u = await atomic.createOrUpdate(User.partition('id-a'), 'id-a', previous => {
        if (previous) {
          throw new Error('unexpected previous');
        } else {
          return new User({ id: 'id-a', favoriteColors: new Set(), username: 'connor' });
        }
      });

      expect(u.props.username).toBe('connor');
      expect(u.etag).toBeTruthy();
    });

    it('retries', async () => {
      let attempts = 0;
      const u = await atomic.createOrUpdate(User.partition('id-a'), 'id-a', async previous => {
        attempts++;
        if (previous) {
          previous.props.username = 'connor';
          return previous;
        } else {
          await new User({ id: 'id-a', favoriteColors: new Set(), username: 'bob' }).create();

          return new User({
            id: 'id-a',
            favoriteColors: new Set(),
            username: 'should not get created',
          });
        }
      });

      expect(attempts).toBe(2);
      expect(u.props.username).toBe('connor');
      expect(u.etag).toBeTruthy();
    });

    it('aborts', async () => {
      const u = await atomic.createOrUpdate(User.partition('id-a'), 'id-a', () => undefined);
      expect(u).toBeUndefined;
    });
  });

  describe('update', () => {
    let user: User;
    beforeEach(async () => {
      user = new User({
        id: 'id-a',
        username: 'connor',
        favoriteColors: new Set(['blue', 'red']),
      });

      await user.create();
    });

    it('works', async () => {
      await atomic.update(user, m => {
        m.props.favoriteColors.delete('red');
        return m;
      });

      const found = await User.partition('id-a').find('id-a');
      expect(found.props.favoriteColors).toEqual(new Set(['blue']));
    });

    it('aborts if model was deleted during update', async () => {
      const err = await atomic
        .update(user, async m => {
          await user.delete();
          m.props.favoriteColors.delete('red');
          return m;
        })
        .catch(err => err);

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(404);
    });

    it('aborts if model was deleted before update', async () => {
      await user.delete();

      const err = await atomic
        .update(user, async m => {
          m.props.favoriteColors.delete('red');
          return m;
        })
        .catch(err => err);

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(404);
    });
  });
});
