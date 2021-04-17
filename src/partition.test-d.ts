import { expectType } from 'tsd';
import { IResourceResponse } from './types';
import { User } from './testUtils';

(async () => {
  expectType<User>(await User.partition('a').find('id'));
  expectType<User | undefined>(await User.partition('a').maybeFind('id'));
  expectType<IResourceResponse<User>>(await User.partition('a').findWithDetails('id'));
})();
