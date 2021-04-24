import { FeedResponse } from '@azure/cosmos';
import { sql } from '.';
import { setupConnection, teardownConnection, User } from './testUtils';

describe('query', () => {
  beforeAll(async () => {
    await setupConnection();

    const user = new User({
      id: 'id-a',
      username: 'connor',
      favoriteColors: new Set(['blue', 'red', 'green', 'purple']),
    });
    await user.create({ validate: false });
  });

  afterAll(async () => {
    await User.partition('id-a')
      .delete('id-a')
      .catch(() => undefined);
    await teardownConnection();
  });

  describe('sql', () => {
    it('works with no parameters', () => {
      expect(sql`HELLO WORLD`).toEqual({ query: 'HELLO WORLD', parameters: [] });
    });

    it('works with single parameters', () => {
      const user = 'Connor';
      expect(sql`HELLO ${user}`).toEqual({
        query: 'HELLO @arg0',
        parameters: [{ name: '@arg0', value: 'Connor' }],
      });
    });

    it('works with multiple parameters', () => {
      const user1 = 'Connor';
      const user2 = 'Bob';
      expect(sql`HELLO ${user1} AND ${user2}`).toEqual({
        query: 'HELLO @arg0 AND @arg1',
        parameters: [
          { name: '@arg0', value: 'Connor' },
          { name: '@arg1', value: 'Bob' },
        ],
      });
    });

    it('deduplicates identical parameters', () => {
      const user1 = 'Connor';
      const user2 = 'Connor';
      expect(sql`HELLO ${user1} AND ${user2}`).toEqual({
        query: 'HELLO @arg0 AND @arg0',
        parameters: [{ name: '@arg0', value: 'Connor' }],
      });
    });
  });

  describe('run', () => {
    const expectResult = (r: FeedResponse<User>) => {
      expect(r.activityId).toBeDefined;
      expect(r.hasMoreResults).toBe(false);
      expect(r.queryMetrics).toBeDefined;
      expect(r.requestCharge).toBeDefined;
      expect(r.resources).toBeDefined;
      expect(r.resources[0]).toBeInstanceOf(User);
      expect(r.resources[0].props.username).toBe('connor');
    };

    it('getAsyncIterator', async () => {
      const it = User.partition('id-a').query.run('SELECT * FROM $self');
      let hadResult = false;
      for await (const r of it.getAsyncIterator()) {
        expectResult(r);
        hadResult = true;
      }

      expect(hadResult).toBe(true);
    });

    it('fetchAll', async () => {
      const it = User.partition('id-a').query.run('SELECT * FROM $self');
      expect(it.hasMoreResults()).toBe(true);
      expectResult(await it.fetchAll());
      expect(it.hasMoreResults()).toBe(false);
    });

    it('fetchNext', async () => {
      const it = User.partition('id-a').query.run('SELECT * FROM $self');
      expect(it.hasMoreResults()).toBe(true);
      expectResult(await it.fetchNext());
      expect(it.hasMoreResults()).toBe(false);
    });

    it('reset', async () => {
      const it = User.partition('id-a').query.run('SELECT * FROM $self');
      expectResult(await it.fetchNext());

      it.reset();
      expect(it.hasMoreResults()).toBe(true);
      expectResult(await it.fetchNext());
      expect(it.hasMoreResults()).toBe(false);
    });
  });
});
