import { useState, useCallback, useEffect } from 'react';

interface AdminDataLoaderOptions<F extends (...args: any[]) => Promise<any>> {
  retries?: number;
  autoRefreshInterval?: number;
  autoRefreshArgs?: Parameters<F>;
  initialLoading?: boolean;
}

export function useAdminDataLoader<F extends (...args: any[]) => Promise<any>>(
  loadFn: F,
  options: AdminDataLoaderOptions<F> = {}
) {
  const {
    retries = 0,
    autoRefreshInterval,
    autoRefreshArgs = [] as Parameters<F>,
    initialLoading = false
  } = options;

  const [loading, setLoading] = useState(initialLoading);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(
    async (...args: Parameters<F>): Promise<ReturnType<F>> => {
      let attempts = 0;
      setLoading(true);
      while (true) {
        try {
          const result = await loadFn(...args);
          setLoading(false);
          return result;
        } catch (err) {
          if (attempts >= retries) {
            setLoading(false);
            throw err;
          }
          attempts += 1;
        }
      }
    },
    [loadFn, retries]
  );

  useEffect(() => {
    if (!autoRefresh || !autoRefreshInterval) return;
    const id = setInterval(() => {
      load(...autoRefreshArgs);
    }, autoRefreshInterval);
    return () => clearInterval(id);
  }, [autoRefresh, autoRefreshInterval, load, autoRefreshArgs]);

  return { loading, load, autoRefresh, setAutoRefresh };
}

