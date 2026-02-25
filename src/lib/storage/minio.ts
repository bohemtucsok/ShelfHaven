import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
});

// Public endpoint for browser-facing URLs (localhost), vs internal Docker hostname (minio)
function getPublicBase() {
  const host = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT;
  return `http://${host}:${process.env.MINIO_PORT}`;
}

export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return `${getPublicBase()}/${bucket}/${key}`;
}

export async function getFile(bucket: string, key: string) {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  return response;
}

export async function deleteFile(bucket: string, key: string) {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

export function getPublicUrl(bucket: string, key: string): string {
  return `${getPublicBase()}/${bucket}/${key}`;
}

// Convert internal Docker MinIO URLs (minio:9000) to browser-accessible URLs (localhost:9000)
export function toPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const internalHost = process.env.MINIO_ENDPOINT;
  const publicHost = process.env.MINIO_PUBLIC_ENDPOINT || internalHost;
  if (internalHost && publicHost && internalHost !== publicHost) {
    return url.replace(`http://${internalHost}:`, `http://${publicHost}:`);
  }
  return url;
}

export async function listAllObjects(bucket: string): Promise<{ key: string; size: number }[]> {
  const objects: { key: string; size: number }[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      })
    );

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key && obj.Size !== undefined) {
          objects.push({ key: obj.Key, size: obj.Size });
        }
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

export function getMinioInternalBase(): string {
  return `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`;
}

export { s3Client };
