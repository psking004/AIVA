/**
 * Login Page - AIVA Authentication Interface
 * Futuristic login with glass panel design
 */

import { LoginForm } from '../../components/auth/login-form';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] relative overflow-hidden">
      {/* Ambient Background Glows */}
      <div className="ambient-glow-blue" style={{ top: '10%', left: '10%' }} />
      <div className="ambient-glow-purple" style={{ bottom: '20%', right: '15%' }} />

      {/* Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />

      <div className="relative z-10">
        <LoginForm />
      </div>

      {/* Bottom Status Bar */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-8">
        <div className="flex items-center gap-2 px-4 py-2 glass-panel rounded-full border border-white/5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">System Online</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 glass-panel rounded-full border border-white/5">
          <span className="material-symbols-outlined text-zinc-500 text-sm">security</span>
          <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Encrypted</span>
        </div>
      </div>
    </div>
  );
}
