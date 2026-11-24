type CapturedPhoto = {
  uri: string;
  base64: string | null;
};

const capturedPhotos = new Map<string, CapturedPhoto>();

export const rememberCapturedPhoto = (uri: string, base64?: string | null) => {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  capturedPhotos.set(key, { uri, base64: base64 ?? null });

  // Camera photos only need to survive the short details/edit flow.
  while (capturedPhotos.size > 5) {
    const oldestKey = capturedPhotos.keys().next().value;
    if (!oldestKey) break;
    capturedPhotos.delete(oldestKey);
  }

  return key;
};

export const getCapturedPhoto = (key: string | null | undefined) =>
  key ? capturedPhotos.get(key) ?? null : null;

export const forgetCapturedPhoto = (key: string | null | undefined) => {
  if (key) capturedPhotos.delete(key);
};
