/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: '#0B0B0F',
        surface: '#141419',
        border3: '#2A2A35',
        accent: '#6C5CE7',
        accent2: '#00D2A0',
        warn2: '#FF6B6B',
        zenblue: '#3B82F6',
        zenpurple: '#8B5CF6',
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        brand: ['Zen Tokyo Zoo', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 60px -20px rgba(108, 92, 231, 0.3)',
        'glow-blue': '0 0 80px -20px rgba(59, 130, 246, 0.25)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
