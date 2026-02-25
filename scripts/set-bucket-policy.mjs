import { S3Client, PutBucketPolicyCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || "minioadmin",
  },
  forcePathStyle: true,
});

// Set read-only public policy for ebooks bucket
const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "PublicRead",
      Effect: "Allow",
      Principal: "*",
      Action: ["s3:GetObject"],
      Resource: ["arn:aws:s3:::ebooks/*"],
    },
  ],
};

await client.send(
  new PutBucketPolicyCommand({
    Bucket: "ebooks",
    Policy: JSON.stringify(policy),
  })
);

console.log("Bucket policy set: ebooks is now publicly readable");

// Also set covers bucket public
const coversPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "PublicRead",
      Effect: "Allow",
      Principal: "*",
      Action: ["s3:GetObject"],
      Resource: ["arn:aws:s3:::covers/*"],
    },
  ],
};

await client.send(
  new PutBucketPolicyCommand({
    Bucket: "covers",
    Policy: JSON.stringify(coversPolicy),
  })
);

console.log("Bucket policy set: covers is now publicly readable");
