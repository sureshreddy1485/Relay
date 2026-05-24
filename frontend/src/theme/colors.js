export const AppThemes = {
  relay: {
    primary: '#06B6D4',       // cyan
    primaryDark: '#0891B2',   // darker cyan
    primaryLight: '#22D3EE',  // lighter cyan
    accent: '#06B6D4',        // cyan
    accentGreen: '#10B981',   // green
    accentAmber: '#0891B2',   // dark cyan
    camera: '#EF4444',        // red-500
    gradients: {
      primary: ['#06B6D4', '#0891B2'],
      dark: ['#080B14', '#151C2E'],
      card: ['#151C2E', '#0F1320'],
      sent: ['#06B6D4', '#0891B2'],
    },
  },
  cyan: {
    primary: '#06B6D4',
    primaryDark: '#0891B2',
    primaryLight: '#22D3EE',
    accent: '#A855F7',
    accentGreen: '#10B981',
    accentAmber: '#F59E0B',
    camera: '#EF4444',
    gradients: {
      primary: ['#06B6D4', '#0891B2'],
      dark: ['#080B14', '#151C2E'],
      card: ['#151C2E', '#0F1320'],
      sent: ['#06B6D4', '#0891B2'],
    },
  }
};

export const Colors = {
  ...AppThemes.relay,
  dark: {
    bg: '#080B14',
    card: '#0F1320',
    surface: '#151C2E',
    border: '#1E2840',
    text: '#E2E8F0',
    textSecondary: '#94A3B8',
    muted: '#64748B',
    input: '#111827',
    bubble: {
      sent: '#0891B2',
      received: '#151C2E',
    },
  },
  light: {
    bg: '#F0FDFF',
    card: '#FFFFFF',
    surface: '#E0F7FA',
    border: '#B2EBF2',
    text: '#0F172A',
    textSecondary: '#475569',
    muted: '#94A3B8',
    input: '#E0F7FA',
    bubble: {
      sent: '#06B6D4',
      received: '#E0F7FA',
    },
  },
};
