// `test` for specs that exercise scoring: every page starts signed in as a
// fresh member (an account linked to its own new player), because scoring is
// gated behind sign-in. tests/e2e/auth.spec.ts covers the sign-in flow itself.
import { test as base } from '@playwright/test';
import { createMember, deleteAccount, useSession, type TestMember } from './supabase';

export { expect } from '@playwright/test';

export const test = base.extend<{ member: TestMember }>({
  member: [
    async ({ page }, use, info) => {
      const member = await createMember(`${info.project.name}-w${info.workerIndex}`);
      await useSession(page, member.session);
      await use(member);
      await deleteAccount(member.email, [member.player.id]);
    },
    { auto: true },
  ],
});
