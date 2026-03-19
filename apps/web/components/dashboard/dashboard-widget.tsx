/**
 * DashboardWidget - Stats card component
 */

import { ArrowUp, ArrowDown } from 'lucide-react';

interface DashboardWidgetProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: string;
  trendUp?: boolean;
}

export function DashboardWidget({
  title,
  value,
  subtitle,
  trend,
  trendUp = true,
}: DashboardWidgetProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {trend && (
          <div
            className={`
              flex items-center gap-1 text-sm
              ${trendUp ? 'text-green-500' : 'text-red-500'}
            `}
          >
            {trendUp ? (
              <ArrowUp className="w-4 h-4" />
            ) : (
              <ArrowDown className="w-4 h-4" />
            )}
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}
