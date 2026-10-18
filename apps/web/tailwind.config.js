/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // AIVA OS Design System: Abyssal Obsidian & Resonant Luminescence
        obsidian: {
          950: '#060709',
          900: '#0C0E14',
          850: '#11141E',
          800: '#161B28',
          750: '#1D2334',
          700: '#252D42',
        },
        cyan: {
          glow: '#38BDF8',
          dim: '#0284C7',
          deep: '#0369A1',
        },
        violet: {
          glow: '#818CF8',
          deep: '#6366F1',
          shadow: '#4F46E5',
        },
        emerald: {
          pulse: '#34D399',
          dim: '#10B981',
          deep: '#059669',
        },
        amber: {
          solar: '#F59E0B',
          dim: '#D97706',
        },
        surface: {
          DEFAULT: '#0C0E14',
          elevated: '#11141E',
          border: 'rgba(255, 255, 255, 0.07)',
          'border-subtle': 'rgba(255, 255, 255, 0.04)',
          'border-highlight': 'rgba(56, 189, 248, 0.3)',
        },
        on: {
          surface: '#F1F5F9',
          muted: '#94A3B8',
          dim: '#64748B',
        },
      },
      fontFamily: {
        telemetry: ['Space Grotesk', 'monospace', 'sans-serif'],
        headline: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'aiva-subtle': '0 0 20px rgba(56, 189, 248, 0.08)',
        'aiva-cyan': '0 0 30px rgba(56, 189, 248, 0.25)',
        'aiva-violet': '0 0 30px rgba(129, 140, 248, 0.25)',
        'aiva-emerald': '0 0 25px rgba(52, 211, 153, 0.25)',
        'aiva-glass': '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'orbital-slow': 'orbital 24s linear infinite',
        'orbital-reverse': 'orbital-reverse 32s linear infinite',
        'pulse-resonant': 'pulse-resonant 4s ease-in-out infinite',
        'conduit-glow': 'conduit-glow 3s ease-in-out infinite',
      },
      keyframes: {
        orbital: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'orbital-reverse': {
          '0%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        'pulse-resonant': {
          '0%, 100%': { opacity: '0.85', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.03)' },
        },
        'conduit-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.9' },
        },
      },
    },
  },
  plugins: [],
};
