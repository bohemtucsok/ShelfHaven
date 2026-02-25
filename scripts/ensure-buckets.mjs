import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || "minioadmin",
  },
  forcePathStyle: true,
});

async function ensureBucket(name) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: name }));
    console.log("Bucket exists:", name);
  } catch (e) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: name }));
      console.log("Bucket created:", name);
    } catch (ce) {
      if (ce.Code === "BucketAlreadyOwnedByYou") {
        console.log("Bucket already exists:", name);
      } else {
        console.error("Create error for", name, ":", ce.name, ce.message);
      }
    }
  }
}

await ensureBucket("ebooks");
await ensureBucket("covers");
console.log("Done");
