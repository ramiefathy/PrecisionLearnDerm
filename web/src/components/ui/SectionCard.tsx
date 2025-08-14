import type { ReactNode } from 'react';

type SectionCardProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
};

export default function SectionCard({ title, subtitle, children, className, headerRight }: SectionCardProps) {
  return (
    <section className={`bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg border border-gray-100 ${className || ''}`}>
      {(title || subtitle || headerRight) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && <h2 className="text-lg font-bold text-gray-900">{title}</h2>}
            {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
          </div>
          {headerRight}
        </div>
      )}
      {children}
    </section>
  );
} 