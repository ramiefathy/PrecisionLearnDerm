import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { create } from 'zustand';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toast, id };
    set({ toasts: [...get().toasts, newToast] });
    
    // Auto remove after duration
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }
  },
  removeToast: (id) => {
    set({ toasts: get().toasts.filter(t => t.id !== id) });
  },
  clearToasts: () => {
    set({ toasts: [] });
  },
}));

// Utility functions for common toast types
export const toast = {
  success: (title: string, description?: string, options?: Partial<Toast>) => {
    useToastStore.getState().addToast({ type: 'success', title, description, ...options });
  },
  error: (title: string, description?: string, options?: Partial<Toast>) => {
    useToastStore.getState().addToast({ type: 'error', title, description, ...options });
  },
  warning: (title: string, description?: string, options?: Partial<Toast>) => {
    useToastStore.getState().addToast({ type: 'warning', title, description, ...options });
  },
  info: (title: string, description?: string, options?: Partial<Toast>) => {
    useToastStore.getState().addToast({ type: 'info', title, description, ...options });
  },
};

function ToastItem({ toast: t, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(true);

  const handleRemove = () => {
    setIsVisible(false);
    setTimeout(() => onRemove(t.id), 150);
  };

  const getToastStyles = () => {
    switch (t.type) {
      case 'success':
        return {
          bg: 'bg-gradient-to-r from-green-500 to-emerald-500',
          icon: '✅',
          border: 'border-green-200'
        };
      case 'error':
        return {
          bg: 'bg-gradient-to-r from-red-500 to-rose-500',
          icon: '❌',
          border: 'border-red-200'
        };
      case 'warning':
        return {
          bg: 'bg-gradient-to-r from-yellow-500 to-orange-500',
          icon: '⚠️',
          border: 'border-yellow-200'
        };
      case 'info':
        return {
          bg: 'bg-gradient-to-r from-blue-500 to-cyan-500',
          icon: 'ℹ️',
          border: 'border-blue-200'
        };
      default:
        return {
          bg: 'bg-gradient-to-r from-gray-500 to-gray-600',
          icon: '💬',
          border: 'border-gray-200'
        };
    }
  };

  const styles = getToastStyles();

  return (
    <motion.div
      initial={{ opacity: 0, x: 300, scale: 0.3 }}
      animate={{ 
        opacity: isVisible ? 1 : 0, 
        x: isVisible ? 0 : 300, 
        scale: isVisible ? 1 : 0.5 
      }}
      exit={{ opacity: 0, x: 300, scale: 0.5 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`relative bg-white/95 backdrop-blur border ${styles.border} rounded-2xl shadow-xl hover:shadow-2xl transition-all max-w-sm w-full`}
    >
      <div className="flex items-start gap-3 p-4">
        <div className={`w-8 h-8 rounded-xl ${styles.bg} grid place-items-center text-white flex-shrink-0`}>
          {styles.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-sm">{t.title}</div>
          {t.description && (
            <div className="text-gray-600 text-sm mt-1 leading-relaxed">{t.description}</div>
          )}
          {t.action && (
            <button
              onClick={t.action.onClick}
              className={`mt-3 px-3 py-1.5 rounded-lg ${styles.bg} text-white text-xs font-medium hover:opacity-90 transition-opacity`}
            >
              {t.action.label}
            </button>
          )}
        </div>
        <button
          onClick={handleRemove}
          className="w-6 h-6 rounded-lg hover:bg-gray-100 grid place-items-center text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-h-screen overflow-hidden">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </AnimatePresence>
    </div>
  );
} 