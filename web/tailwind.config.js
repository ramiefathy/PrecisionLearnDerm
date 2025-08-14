/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { '2xl': '1400px' }
    },
    extend: {
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "-apple-system"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system"],
      },
      colors: {
        brand: {
          DEFAULT: "#2563eb",
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a"
        },
        accent: {
          emerald: { light: "#6ee7b7", DEFAULT: "#10b981", dark: "#047857" },
          amber: { light: "#fbbf24", DEFAULT: "#f59e0b", dark: "#d97706" },
          rose: { light: "#f9a8d4", DEFAULT: "#ec4899", dark: "#be185d" },
          violet: { light: "#c4b5fd", DEFAULT: "#8b5cf6", dark: "#7c3aed" },
          cyan: { light: "#67e8f9", DEFAULT: "#06b6d4", dark: "#0891b2" }
        }
      },
      borderRadius: {
        xl: "1rem",
        '2xl': "1.25rem",
        '3xl': "1.5rem",
        '4xl': "2rem",
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(2,6,23,0.08)",
        glow: "0 0 40px rgba(59, 130, 246, 0.15)",
        'emerald-glow': "0 0 40px rgba(16, 185, 129, 0.15)",
        'violet-glow': "0 0 40px rgba(139, 92, 246, 0.15)",
        'rose-glow': "0 0 40px rgba(236, 72, 153, 0.15)"
      },
      backgroundImage: {
        'radial-fade': 'radial-gradient(1200px 400px at 20% -10%, rgba(56,189,248,0.15), transparent 60%), radial-gradient(1200px 400px at 80% 110%, rgba(167,139,250,0.18), transparent 60%)',
        'learning-gradient': 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(139,92,246,0.1) 50%, rgba(236,72,153,0.1) 100%)',
        'quiz-gradient': 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(6,182,212,0.1) 100%)',
        'progress-gradient': 'linear-gradient(90deg, rgba(59,130,246,1) 0%, rgba(139,92,246,1) 50%, rgba(236,72,153,1) 100%)'
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'bounce-slow': 'bounce 2s infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' }
        }
      }
    },
  },
  plugins: [],
}
