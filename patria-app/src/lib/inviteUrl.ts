const PREFIX = 'patria://invite/';

export function inviteUrlFromToken(token: string): string {
  return `${PREFIX}${token}`;
}

export function tokenFromInviteUrl(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed.startsWith(PREFIX)) {
    const token = trimmed.slice(PREFIX.length).split(/[/?#]/)[0];
    return token.length > 0 ? token : null;
  }
  const match = trimmed.match(/invite\/([a-fA-F0-9]+)/);
  return match?.[1] ?? null;
}
