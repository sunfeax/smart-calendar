const GIS_SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | undefined;

export function loadGoogleScript(): Promise<void> {
  if (loading !== undefined) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error('Failed to load the Google script'));
    };
    document.head.append(script);
  });

  return loading;
}
