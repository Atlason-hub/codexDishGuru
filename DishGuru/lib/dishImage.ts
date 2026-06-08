import { supabase } from './supabase';

const SUPABASE_BASE = 'https://pcamdhbgjbsnfwicyiqa.supabase.co';
const DISH_IMAGE_BUCKET = 'dish-images';

const toPublicObjectUrl = (bucket: string, objectPath: string) => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data?.publicUrl ?? null;
};

const normalizeStorageUrl = (raw: string) => {
  if (raw.includes('/storage/v1/render/image/public/')) {
    const parts = raw.split('/storage/v1/render/image/public/');
    if (parts.length === 2) {
      const [pathPart] = parts[1].split('?');
      const segments = pathPart.split('/');
      const bucket = segments[0];
      const objectPath = segments.slice(1).join('/');
      return {
        bucket,
        objectPath,
        url: toPublicObjectUrl(bucket, objectPath),
      };
    }
  }

  if (raw.includes('/storage/v1/object/public/')) {
    const parts = raw.split('/storage/v1/object/public/');
    if (parts.length === 2) {
      const [pathPart] = parts[1].split('?');
      const segments = pathPart.split('/');
      const bucket = segments[0];
      const objectPath = segments.slice(1).join('/');
      return {
        bucket,
        objectPath,
        url: toPublicObjectUrl(bucket, objectPath),
      };
    }
  }

  return null;
};

export const resolveDishImageUrl = (
  rawUrl: string | null | undefined,
  imagePath?: string | null
) => {
  if (imagePath) {
    const rebuilt = toPublicObjectUrl(DISH_IMAGE_BUCKET, imagePath);
    if (rebuilt) return rebuilt;
  }

  if (!rawUrl) return null;
  if (rawUrl.startsWith('data:')) return rawUrl;
  if (rawUrl.startsWith('//')) return `https:${rawUrl}`;

  const normalizedStorage = normalizeStorageUrl(rawUrl);
  if (normalizedStorage?.bucket === DISH_IMAGE_BUCKET && normalizedStorage.url) {
    return normalizedStorage.url;
  }

  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) return rawUrl;
  if (rawUrl.startsWith('/')) return `${SUPABASE_BASE}${rawUrl}`;
  return `${SUPABASE_BASE}/${rawUrl}`;
};
