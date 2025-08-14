import { useState, useEffect } from 'react';
import { toast } from '../components/Toast';

interface NetworkState {
  online: boolean;
  downlink?: number;
  effectiveType?: string;
  rtt?: number;
}

export function useNetworkState() {
  const [networkState, setNetworkState] = useState<NetworkState>({
    online: navigator.onLine
  });

  useEffect(() => {
    const updateNetworkState = () => {
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      
      setNetworkState({
        online: navigator.onLine,
        downlink: connection?.downlink,
        effectiveType: connection?.effectiveType,
        rtt: connection?.rtt
      });
    };

    const handleOnline = () => {
      updateNetworkState();
      toast.success('Back online!', 'Your connection has been restored.');
    };

    const handleOffline = () => {
      updateNetworkState();
      toast.warning('You\'re offline', 'Some features may be limited until your connection is restored.');
    };

    const handleConnectionChange = () => {
      updateNetworkState();
    };

    // Set initial state
    updateNetworkState();

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }
    };
  }, []);

  return networkState;
}

// Hook for detecting slow connections
export function useSlowConnection() {
  const networkState = useNetworkState();
  
  const isSlowConnection = () => {
    if (!networkState.online) return false;
    
    // Consider it slow if:
    // - Effective type is '2g' or 'slow-2g'
    // - RTT > 1000ms
    // - Downlink < 0.5 Mbps
    return (
      networkState.effectiveType === '2g' ||
      networkState.effectiveType === 'slow-2g' ||
      (networkState.rtt && networkState.rtt > 1000) ||
      (networkState.downlink && networkState.downlink < 0.5)
    );
  };

  return {
    ...networkState,
    isSlowConnection: isSlowConnection()
  };
} 