/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        base: '#0c0d0f',
        panel: '#141518',
        elevated: '#191b1f',
        hover: '#1f2227',
        line: '#2a2d33',
        'line-soft': '#202327',
        ink: '#d7dbe0',
        'ink-dim': '#9aa0a8',
        'ink-mute': '#6b7178',
        amber: '#d98b4d',
        'amber-bright': '#e89a5a',
        azure: '#4a9eff',
        good: '#5bbf7a',
        bad: '#e5634d'
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'Menlo', 'monospace']
      },
      fontSize: {
        '2xs': ['10px', '14px']
      }
    }
  },
  plugins: []
}
