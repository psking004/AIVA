/**
 * AIVA DashboardWidget - Futuristic Stats Card
 * Glass panel design with neon accents
 */

import { ArrowUp, ArrowDown } from 'lucide-react';

interface DashboardWidgetProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: string;
  trendUp?: boolean;
  icon?: string;
}

export function DashboardWidget({
  title,
  value,
  subtitle,
  trend,
  trendUp = true,
  icon,
}: DashboardWidgetProps) {
  return (
    <div className="glass-panel p-5 rounded-xl border border-white/5 hover:border-blue-500/30 transition-all duration-300 group cursor-pointer">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-blue-400 text-sm">{icon}</span>
            </div>
          )}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{title}</p>
            <p className="text-2xl font-headline font-bold text-on-surface mt-0.5">{value}</p>
          </div>
        </div>
        {trend && (
          <div
            className={`
              flex items-center gap-1 text-xs font-bold
              ${trendUp ? 'text-green-400' : 'text-red-400'}
            `}
          >
            {trendUp ? (
              <ArrowUp className="w-3.5 h-3.5" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5" />
            )}
            {trend}
          </div>
        )}
      </div>
      {subtitle && (
        <p className="text-[10px] text-zinc-600">{subtitle}</p>
      )}

      {/* Hover glow effect */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/0 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}
