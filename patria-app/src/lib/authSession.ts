import { routes } from './navigation';

export async function signOutAndGoWelcome(input: {
  signOut: () => Promise<unknown>;
  replace: (href: string) => void;
}): Promise<void> {
  await input.signOut();
  input.replace(routes.welcome);
}
