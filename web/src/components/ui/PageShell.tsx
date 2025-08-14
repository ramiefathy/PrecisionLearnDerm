import type { ReactNode } from 'react';

type PageShellProps = {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  containerClassName?: string;
  headerSticky?: boolean;
  maxWidth?: '4xl' | '5xl' | '7xl';
};

export default function PageShell({
  title,
  subtitle,
  right,
  children,
  containerClassName,
  headerSticky = true,
  maxWidth = '7xl',
}: PageShellProps) {
  const mw = maxWidth === '4xl' ? 'max-w-4xl' : maxWidth === '5xl' ? 'max-w-5xl' : 'max-w-7xl';
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className={`${headerSticky ? 'sticky top-0 z-40' : ''} bg-white/80 backdrop-blur border-b border-gray-200`}>
        <div className={`${mw} mx-auto px-4 py-4`}>
          {(title || subtitle || right) && (
            <div className="flex items-center justify-between">
              <div>
                {title && <h1 className="text-xl md:text-2xl font-bold text-gray-900">{title}</h1>}
                {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
              </div>
              {right}
            </div>
          )}
        </div>
      </div>
      <div className={`${mw} mx-auto px-4 py-6 ${containerClassName || ''}`}>
        {children}
      </div>
    </main>
  );
} 