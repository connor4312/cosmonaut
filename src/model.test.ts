import { setupConnection, teardownConnection, User } from './testUtils';

describe('Model', () => {
  let existing: User;
  beforeAll(async () => {
    await setupConnection();

    existing = new User({
      id: 'id-a',
      username: 'connor',
      favoriteColors: ['blue'],
    });

    await existing.create();
  });

  afterAll(teardownConnection);

  describe('find', () => {
    it('404s if does not exist', async () => {
      await expect(User.partition('id-a').find('invalid-id')).rejects.toThrow(/404/);
    });

    it('looks up an existing user', async () => {
      const found = await User.partition('id-a').find('id-a');
      expect(found.props).toMatchObject(existing.props);
    });
  });
});
