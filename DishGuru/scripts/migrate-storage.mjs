import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const required = [
  'OLD_SUPABASE_URL',
  'OLD_SUPABASE_SERVICE_ROLE_KEY',
  'NEW_SUPABASE_URL',
  'NEW_SUPABASE_SERVICE_ROLE_KEY',
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const oldClient = createClient(
  process.env.OLD_SUPABASE_URL,
  process.env.OLD_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const newClient = createClient(
  process.env.NEW_SUPABASE_URL,
  process.env.NEW_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const tempRoot = path.resolve(
  process.cwd(),
  process.env.STORAGE_MIGRATION_TEMP_DIR || '../supabase-migration/storage-temp'
);

const filterBuckets = (process.env.BUCKETS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
};

const resolveMimeType = (objectPath, metadataMimeType, blobType) => {
  if (metadataMimeType) return metadataMimeType;
  if (blobType && blobType !== 'application/octet-stream') return blobType;
  const extension = path.extname(objectPath).toLowerCase();
  return MIME_BY_EXT[extension] || 'application/octet-stream';
};

const ensureBucket = async (bucket) => {
  const { data: existingBuckets, error: listError } = await newClient.storage.listBuckets();
  if (listError) throw listError;

  if (existingBuckets.some((item) => item.name === bucket.name)) {
    return;
  }

  const options = {
    public: Boolean(bucket.public),
  };

  if (bucket.file_size_limit) options.fileSizeLimit = bucket.file_size_limit;
  if (bucket.allowed_mime_types) options.allowedMimeTypes = bucket.allowed_mime_types;

  const { error } = await newClient.storage.createBucket(bucket.name, options);
  if (error && !String(error.message || '').includes('already exists')) {
    throw error;
  }
};

const listAllObjects = async (bucketName, prefix = '') => {
  let page = 0;
  const pageSize = 1000;
  const objects = [];

  while (true) {
    const { data, error } = await oldClient.storage.from(bucketName).list(prefix, {
      limit: pageSize,
      offset: page * pageSize,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) throw error;
    if (!data?.length) break;

    for (const item of data) {
      if (!item.name) continue;
      const childPath = prefix ? `${prefix}/${item.name}` : item.name;

      if (item.metadata === null) {
        const nested = await listAllObjects(bucketName, childPath);
        objects.push(...nested);
      } else {
        objects.push({
          path: childPath,
          metadata: item.metadata || {},
        });
      }
    }

    if (data.length < pageSize) break;
    page += 1;
  }

  return objects;
};

const copyObject = async (bucketName, objectInfo) => {
  const objectPath = objectInfo.path;
  const { data, error } = await oldClient.storage.from(bucketName).download(objectPath);
  if (error) throw error;

  const bytes = new Uint8Array(await data.arrayBuffer());
  const contentType = resolveMimeType(
    objectPath,
    objectInfo.metadata?.mimetype || objectInfo.metadata?.contentType,
    data.type || undefined
  );
  const cacheControl =
    objectInfo.metadata?.cacheControl ||
    objectInfo.metadata?.cache_control ||
    undefined;

  const { error: uploadError } = await newClient.storage.from(bucketName).upload(objectPath, bytes, {
    contentType,
    cacheControl,
    upsert: true,
  });

  if (uploadError) throw uploadError;
};

const main = async () => {
  await fs.mkdir(tempRoot, { recursive: true });

  const { data: sourceBuckets, error: bucketsError } = await oldClient.storage.listBuckets();
  if (bucketsError) throw bucketsError;

  const buckets = sourceBuckets.filter((bucket) =>
    filterBuckets.length ? filterBuckets.includes(bucket.name) : true
  );

  console.log(`Found ${buckets.length} bucket(s) to migrate.`);

  for (const bucket of buckets) {
    console.log(`\nMigrating bucket: ${bucket.name}`);
    await ensureBucket(bucket);

    const objects = await listAllObjects(bucket.name);
    console.log(`Found ${objects.length} object(s) in ${bucket.name}.`);

    for (const [index, objectInfo] of objects.entries()) {
      const counter = `${index + 1}/${objects.length}`;
      console.log(`  [${counter}] ${objectInfo.path}`);
      await copyObject(bucket.name, objectInfo);
      await sleep(25);
    }
  }

  console.log('\nStorage migration complete.');
};

main().catch((error) => {
  console.error('\nStorage migration failed.');
  console.error(error);
  process.exit(1);
});
