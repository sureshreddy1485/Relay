/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Nexo brand palette
        primary: {
          DEFAULT: '#6C63FF',
          50: '#F0EFFE',
          100: '#D9D7FD',
          200: '#B3AEFB',
          300: '#8D85F9',
          400: '#6C63FF',
          500: '#4B41F7',
          600: '#3028E5',
          700: '#2319C3',
          800: '#190EA1',
          900: '#0F0681',
        },
        accent: '#FF6B9D',
        surface: {
          DEFAULT: '#1A1A2E',
          card: '#16213E',
          modal: '#0F3460',
        },
        dark: {
          bg: '#0A0A0F',
          card: '#12121A',
          border: '#2A2A3E',
          text: '#E8E8F0',
          muted: '#6B7280',
        },
        light: {
          bg: '#F8F8FF',
          card: '#FFFFFF',
          border: '#E5E7EB',
          text: '#1A1A2E',
          muted: '#6B7280',
        },
        online: '#22C55E',
        away: '#F59E0B',
        camera: '#EF4444',
        bubble: {
          sent: '#6C63FF',
          received: '#1E1E2E',
        },
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
