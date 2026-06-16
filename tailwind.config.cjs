/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0a',
          panel: '#0e0e0e',
          card: '#141414',
          subtle: '#1c1c1c'
        },
        border: { DEFAULT: '#262626', strong: '#383838' },
        text: { DEFAULT: '#ededed', muted: '#a3a3a3', faint: '#6b6b6b' },
        accent: { DEFAULT: '#fafafa', soft: '#d4d4d4' },
        success: '#4ade80',
        warn: '#fbbf24',
        danger: '#f87171'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      }
    }
  },
  plugins: []
}
