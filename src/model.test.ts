import Ajv from 'ajv';
import { CosmosError } from './errors';
import { setupConnection, teardownConnection, User } from './testUtils';

describe('Model', () => {
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

  describe('find', () => {
    it('404s if does not exist', async () => {
      await expect(User.partition('id-a').find('invalid-id')).rejects.toThrow(CosmosError);
    });

    it('creates and looks up user', async () => {
      const existing = new User({
        id: 'id-a',
        username: 'connor',
        favoriteColors: new Set(['blue']),
      });

      await existing.create();

      try {
        const found = await User.partition('id-a').find('id-a');
        expect(found.props).toEqual(existing.props);
      } catch (e) {}
    });
  });

  describe('create', () => {
    it('validates', async () => {
      await expect(
        new User({
          id: 'id-a',
          username: 'connor',
          favoriteColors: new Set(['blue', 'red', 'green', 'purple']),
        }).create(),
      ).rejects.toThrow(Ajv.ValidationError);
    });

    it('bypasses validation on request', async () => {
      const user = new User({
        id: 'id-a',
        username: 'connor',
        favoriteColors: new Set(['blue', 'red', 'green', 'purple']),
      });
      await user.create({ validate: false });
    });

    it('throws a conflict if existing user', async () => {
      const user1 = new User({ id: 'id-a', username: 'connor', favoriteColors: new Set([]) });
      await user1.create();
      const user2 = new User({ id: 'id-a', username: 'bob', favoriteColors: new Set([]) });
      await expect(user2.create()).rejects.toThrow(/already exists/);
    });

    it('force updates', async () => {
      const user1 = new User({ id: 'id-a', username: 'connor', favoriteColors: new Set([]) });
      await user1.create();
      const user2 = new User({ id: 'id-a', username: 'bob', favoriteColors: new Set([]) });
      await user2.create({ force: true });

      const found = await User.partition('id-a').find('id-a');
      expect(found.props.username).toBe('bob');
    });

    it('calls lifecycle hooks', async () => {
      const calls: string[] = [];
      const user = new User({ id: 'id-a', username: 'connor', favoriteColors: new Set([]) });

      user.beforePersist = async () => {
        calls.push('beforePersist');
      };
      user.beforeCreate = async () => {
        calls.push('beforeCreate');
      };
      user.afterPersist = async () => {
        calls.push('afterPersist');
      };
      user.afterCreate = async () => {
        calls.push('afterCreate');
      };

      await user.save();

      expect(calls).toEqual(['beforeCreate', 'beforePersist', 'afterPersist', 'afterCreate']);
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

    it('validates', async () => {
      user.props.favoriteColors.add('green');
      user.props.favoriteColors.add('purple');
      await expect(user.update()).rejects.toThrow(Ajv.ValidationError);
    });

    it('bypasses validation on request', async () => {
      user.props.favoriteColors.add('green');
      user.props.favoriteColors.add('purple');
      await user.save({ validate: false });
    });

    it('throws a conflict on current update', async () => {
      await new User({ id: 'id-a', username: 'connor', favoriteColors: new Set([]) }).create({
        force: true,
      });
      await expect(user.save()).rejects.toThrow(/pre-?condition is not met/);
    });

    it('force updates', async () => {
      await new User({ id: 'id-a', username: 'connor', favoriteColors: new Set([]) }).create({
        force: true,
      });
      await user.save({ force: true });
    });

    it('calls lifecycle hooks', async () => {
      const calls: string[] = [];
      user.beforePersist = async () => {
        calls.push('beforePersist');
      };
      user.beforeUpdate = async () => {
        calls.push('beforeUpdate');
      };
      user.afterPersist = async () => {
        calls.push('afterPersist');
      };
      user.afterUpdate = async () => {
        calls.push('afterUpdate');
      };

      await user.save();

      expect(calls).toEqual(['beforeUpdate', 'beforePersist', 'afterPersist', 'afterUpdate']);
    });
  });

  describe('delete', () => {
    let user: User;
    beforeEach(async () => {
      user = new User({
        id: 'id-a',
        username: 'connor',
        favoriteColors: new Set(['blue', 'red']),
      });

      await user.create();
    });

    it('deletes', async () => {
      await user.delete();
      expect(await User.partition('id-a').maybeFind('id-a')).toBeUndefined;
    });

    it('throws on conflict', async () => {
      await new User({ id: 'id-a', username: 'connor', favoriteColors: new Set([]) }).create({
        force: true,
      });

      await expect(user.delete()).rejects.toThrow(/pre-?condition is not met/);
    });

    it('force deletes', async () => {
      await new User({ id: 'id-a', username: 'connor', favoriteColors: new Set([]) }).create({
        force: true,
      });

      await user.delete({ force: true });
    });

    it('requires etag to delete', async () => {
      await new User({ id: 'id-a', username: 'connor', favoriteColors: new Set([]) }).create({
        force: true,
      });

      await expect(
        new User({ id: 'id-a', username: 'connor', favoriteColors: new Set([]) }).delete(),
      ).rejects.toThrow(/has an _etag/);
    });

    it('calls lifecycle hooks', async () => {
      const calls: string[] = [];
      user.beforeDelete = async () => {
        calls.push('beforeDelete');
      };
      user.afterDelete = async () => {
        calls.push('afterDelete');
      };

      await user.delete();

      expect(calls).toEqual(['beforeDelete', 'afterDelete']);
    });
  });

  it('round trips custom serialization', async () => {
    const original = new User({ id: 'id-a', username: 'connor', favoriteColors: new Set(['red']) });
    await original.create();

    const found = await User.partition('id-a').find('id-a');
    expect(found.props.favoriteColors).toEqual(new Set(['red']));
    found.props.favoriteColors.add('blue');
    await found.save();

    const found2 = await User.partition('id-a').find('id-a');
    expect(found2.props.favoriteColors).toEqual(new Set(['red', 'blue']));
  });

  it('toObject', () => {
    const model = new User({
      id: 'id-a',
      username: 'connor',
      favoriteColors: new Set(['red']),
      _etag: 'shouldBeIgnored',
    });

    expect(model.toObject()).toEqual({
      id: 'id-a',
      username: 'connor',
      favoriteColors: new Set(['red']),
    });
  });
});
