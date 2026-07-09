/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-deep': '#070a13',
        'card-dark': '#0f1422',
        'border-dark': '#1f293d',
        'accent-blue': '#3b82f6',
        'accent-cyan': '#06b6d4',
        'accent-emerald': '#10b981',
        'accent-rose': '#f43f5e',
        'accent-amber': '#f59e0b',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        header: ['Outfit', 'system-ui', 'sans-serif'],
      },
      aspectRatio: {
        '4/3': '4 / 3',
        'video': '16 / 9',
      },
    },
  },
  plugins: [],
}
