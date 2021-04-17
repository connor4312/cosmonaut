import { setupConnection, teardownConnection, User } from './testUtils';

describe('Partition', () => {
  beforeAll(setupConnection);
  afterAll(teardownConnection);

  it('find', async () => {
    await expect(User.partition('a').find('someId')).rejects.toThrow(/404/);
  });
});
