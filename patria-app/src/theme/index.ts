export const colors = {
  background: '#F7F1E8',
  surface: '#FFFBF5',
  primary: '#2F4F3E',
  accent: '#C8553D',
  text: '#1F2A24',
  textMuted: '#5C6B64',
  onThisDay: '#F3DDD0',
  danger: '#9B3A2F',
  chip: '#E7E1D6',
  onPrimary: '#F7F1E8',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const type = {
  heading: {
    fontFamily: 'serif',
    fontSize: 28,
    lineHeight: 34,
  },
  body: {
    fontFamily: 'System',
    fontSize: 16,
    lineHeight: 24,
  },
  caption: {
    fontFamily: 'System',
    fontSize: 14,
    lineHeight: 20,
  },
} as const;
