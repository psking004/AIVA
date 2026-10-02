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
        // AIVA Design System Colors
        surface: {
          container: {
            high: '#2a2a2c',
            low: '#1b1b1d',
            lowest: '#0e0e10',
            DEFAULT: '#1f1f21',
            highest: '#353437',
          },
          tint: '#adc6ff',
          dim: '#131315',
          bright: '#39393b',
        },
        tertiary: {
          fixed: '#e5e2e1',
          'fixed-dim': '#c9c6c5',
          DEFAULT: '#c9c6c5',
          container: '#929090',
        },
        primary: {
          fixed: '#d8e2ff',
          'fixed-dim': '#adc6ff',
          DEFAULT: '#adc6ff',
          container: '#4b8eff',
        },
        secondary: {
          fixed: '#f6d9ff',
          'fixed-dim': '#e9b3ff',
          DEFAULT: '#e9b3ff',
          container: '#7d01b1',
        },
        error: {
          DEFAULT: '#ffb4ab',
          container: '#93000a',
        },
        on: {
          primary: '#002e69',
          'primary-fixed': '#001a41',
          'primary-fixed-variant': '#004493',
          'primary-container': '#00285c',
          secondary: '#510074',
          'secondary-fixed': '#310048',
          'secondary-fixed-variant': '#7200a3',
          'secondary-container': '#e5a9ff',
          tertiary: '#313030',
          'tertiary-fixed': '#1c1b1b',
          'tertiary-fixed-variant': '#474646',
          'tertiary-container': '#2a2a29',
          surface: '#e4e2e4',
          'surface-variant': '#c1c6d7',
          background: '#e4e2e4',
          error: '#690005',
          'error-container': '#ffdad6',
        },
        inverse: {
          surface: '#e4e2e4',
          primary: '#005bc1',
          'on-surface': '#303032',
        },
        outline: '#8b90a0',
        'outline-variant': '#414755',
        surface: {
          variant: '#353437',
          DEFAULT: '#131315',
        },
        background: '#050505',
      },
      fontFamily: {
        body: ['Inter', 'sans-serif'],
        headline: ['Space Grotesk', 'sans-serif'],
        code: ['Space Grotesk', 'monospace'],
        label: ['Space Grotesk', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      fontSize: {
        'body-md': ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'headline-lg': ['32px', { lineHeight: '1.2', fontWeight: '600' }],
        'code-sm': ['14px', { lineHeight: '1.4', letterSpacing: '0.05em', fontWeight: '500' }],
        'label-xs': ['12px', { lineHeight: '1', fontWeight: '600' }],
        'display-xl': ['48px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        full: '0.75rem',
      },
      spacing: {
        'stack-gap': '1rem',
        unit: '4px',
        gutter: '1.5rem',
        margin: '2rem',
        'container-max': '1440px',
      },
      boxShadow: {
        'neon': '0 0 15px rgba(173, 198, 255, 0.15)',
        'neon-strong': '0 0 20px rgba(0, 122, 255, 0.05)',
        'glow': '0 0 30px rgba(0, 122, 255, 0.1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'ping-slow': {
          '75%, 100%': {
            transform: 'scale(2)',
            opacity: '0',
          },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'pulse-slow': 'pulse-slow 4s infinite',
        'ping-slow': 'ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};
