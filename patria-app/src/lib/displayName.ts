import { copy } from './copy';

export function hasDisplayName(name: string | null | undefined): boolean {
  return Boolean(name && name.trim().length > 0);
}

export function memberDisplayName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : copy.member.fallbackName;
}
