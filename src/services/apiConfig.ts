export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const isCapacitorNative = !!(window as any).Capacitor?.isNative;
    const isLocalhostOrigin = window.location.origin.includes('localhost') || 
                              window.location.origin.includes('capacitor://') || 
                              window.location.protocol === 'file:';
    
    // Use relative path only when running on a real web domain (not Capacitor / localhost app)
    if (!isCapacitorNative && !isLocalhostOrigin) {
      return '';
    }
  }
  
  const envUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_APP_URL;
  if (envUrl && envUrl !== '') {
    return envUrl.replace(/\/$/, '');
  }

  return "https://ais-pre-vnvd2uudmu6l2atxxr7h75-18391378124.asia-southeast1.run.app";
};

export const API_BASE_URL = getApiBaseUrl();

export const getFullApiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL === '') {
    return cleanPath;
  }
  return `${API_BASE_URL}${cleanPath}`;
};
