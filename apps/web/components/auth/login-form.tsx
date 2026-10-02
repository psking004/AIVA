/**
 * AIVA Login Form - Futuristic Authentication
 * Glass panel design with neon accents
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Simulated login - replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // In production: await aivaClient.login({ email, password });
      onSuccess?.();
      router.push('/');
    } catch (err) {
      setError('Authentication failed. Check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md"
    >
      <div className="glass-panel p-8 rounded-3xl border border-white/10 shadow-[0_0_100px_rgba(0,122,255,0.1)]">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-900 flex items-center justify-center mx-auto mb-4 neon-glow-blue"
          >
            <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              bolt
            </span>
          </motion.div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">
            Welcome to <span className="text-blue-400">AIVA</span>
          </h1>
          <p className="text-zinc-500 mt-2 text-sm">
            Initialize your personal AI operating system
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email Field */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">
              Identity
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-zinc-500 text-sm">mail</span>
              </div>
              <input
                type="email"
                placeholder="operator@aiva.systems"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl
                           text-on-surface placeholder:text-zinc-600
                           focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                           transition-all duration-300"
                required
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">
              Access Code
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-zinc-500 text-sm">lock</span>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-xl
                           text-on-surface placeholder:text-zinc-600
                           focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                           transition-all duration-300"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-red-400 text-sm">error</span>
              <p className="text-red-400 text-sm">{error}</p>
            </motion.div>
          )}

          {/* Forgot Password */}
          <div className="flex justify-end">
            <button
              type="button"
              className="text-[10px] text-zinc-500 hover:text-blue-400 transition-colors uppercase tracking-wider font-bold"
            >
              Recover Access
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500
                       disabled:opacity-50 disabled:cursor-not-allowed
                       rounded-xl font-headline text-sm font-bold uppercase tracking-widest
                       transition-all duration-300 active:scale-[0.98] neon-glow-blue relative overflow-hidden group"
          >
            {/* Button Glow Animation */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />

            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Authenticating...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <span>Initialize Session</span>
                <span className="material-symbols-outlined text-sm">login</span>
              </div>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-4 bg-[#1a1a1c] text-zinc-500 uppercase tracking-widest">Or Continue With</span>
          </div>
        </div>

        {/* OAuth Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="flex items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all group"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="text-sm text-zinc-400 group-hover:text-zinc-200">Google</span>
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all group"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span className="text-sm text-zinc-400 group-hover:text-zinc-200">GitHub</span>
          </button>
        </div>

        {/* Sign Up Link */}
        <div className="mt-8 text-center">
          <p className="text-zinc-500 text-sm">
            New operator?{' '}
            <a href="/register" className="text-blue-400 hover:text-blue-300 transition-colors font-bold">
              Initialize Account
            </a>
          </p>
        </div>
      </div>

      {/* Bottom Decorative Elements */}
      <div className="mt-8 flex justify-center gap-12">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-zinc-600 text-sm">security</span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Encrypted</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-zinc-600 text-sm">verified_user</span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Secure</span>
        </div>
      </div>
    </motion.div>
  );
}
