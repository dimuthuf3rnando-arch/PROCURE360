/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg)',
        'canvas-deep': 'var(--bg-deep)',
        surface: 'var(--card)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        forest: {
          DEFAULT: 'var(--forest)',
          dark: 'var(--forest-dark)',
          tint: 'var(--forest-tint)',
        },
        amber: {
          DEFAULT: 'var(--amber)',
          tint: 'var(--amber-tint)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          tint: 'var(--danger-tint)',
        },
        info: {
          DEFAULT: 'var(--info)',
          tint: 'var(--info-tint)',
        },
        gold: 'var(--gold)',
        topbar: 'var(--topbar)',
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px var(--shadow-1), 0 8px 30px var(--shadow-2)',
        lift: '0 2px 4px var(--shadow-1), 0 20px 50px var(--shadow-3)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '18px',
        '3xl': '24px',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(6px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        growBar: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-600px 0' },
          '100%': { backgroundPosition: '600px 0' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fadeIn 0.3s ease both',
        'scale-in': 'scaleIn 0.22s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-right': 'slideInRight 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-down': 'slideDown 0.2s ease both',
        'grow-bar': 'growBar 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
