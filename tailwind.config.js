/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fusion5: {
          primary: '#003366',
          secondary: '#0b4a87',
          accent: '#1d6fb8',
          light: '#e8f2fb',
        },
      },
    },
  },
  plugins: [],
}
