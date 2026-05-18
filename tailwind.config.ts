// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'monospace'],
      },
      colors: {
        ink: {
          900: '#0D0D0E',
          800: '#1A1A1C',
          700: '#2E2E31',
          600: '#4A4A50',
          500: '#6B6B75',
          400: '#8E8E9A',
          300: '#B0B0BD',
          200: '#D1D1DC',
          100: '#E8E8EF',
          50: '#F4F4F6',
        },
        accent: {
          DEFAULT: '#1A56DB',
          hover: '#1648C4',
        },
        success: '#0B7A51',
        danger: '#C0392B',
        warn: '#92400E',
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
}
export default config
