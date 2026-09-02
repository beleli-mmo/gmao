import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Stockage objet S3‑compatible (Cloudflare R2, MinIO, AWS S3…).
 * Si aucune configuration n'est fournie, `putObject` devient un no‑op : les DI se
 * synchronisent quand même, seules les pièces jointes ne sont pas conservées côté serveur.
 */
const ENABLED = Boolean(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);
const BUCKET = process.env.S3_BUCKET ?? 'gmao-media';

let s3: S3Client | null = null;
if (ENABLED) {
  s3 = new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });
} else {
  console.warn('[object-store] S3 non configuré — les pièces jointes ne seront pas stockées.');
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (!s3) return key;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
  return key;
}

export async function signedGetUrl(key: string, expiresIn = 3600): Promise<string | null> {
  if (!s3) return null;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}
