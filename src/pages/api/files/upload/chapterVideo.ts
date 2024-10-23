// src/pages/api/files/upload/image.ts
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import { createReadStream } from "fs";
import { nanoid } from "nanoid";
import { createBucketIfNotExists, s3Client } from "~/utils/s3-file-management";
import corsMiddleware from "~/lib/corsMiddleware";

const BUCKET_NAME = "assets";
const ACCEPTED_IMAGE_TYPES = ["video/mp4", "video/mkv", "video/avi", "video/mov", "video/wmv"];
const MAX_FILE_SIZE = 512 * 1024 * 1024 * 1024; // 512GB

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await corsMiddleware(req, res);
  console.log("Request received");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("Processing upload..."); // Log 2
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      keepExtensions: true,
    });

    console.log("Parsing form data...");
    // Parse form data
    const [fields, files] = await form.parse(req);
    console.log("Files received:", files); // Log 4
    const file = files.file?.[0];

    if (!file) {
      console.log("No file found in request"); // Log 5
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Validate file type
    if (!ACCEPTED_IMAGE_TYPES.includes(file.mimetype ?? "")) {
      return res.status(400).json({ error: "File type not supported" });
    }
    if (!file.originalFilename) {
      return res.status(500).json({ error: "Invalid file name" });
    }
    // Create unique filename
    const fileName = `${nanoid(5)}-${file?.originalFilename}`;

    // Create bucket if not exists
    await createBucketIfNotExists(BUCKET_NAME);

    // Upload file to Minio
    const fileStream = createReadStream(file.filepath);
    await s3Client.putObject(BUCKET_NAME, fileName, fileStream, {
      "Content-Type": file.mimetype || "application/octet-stream",
    });

    // Generate presigned URL
    const url = await s3Client.presignedGetObject(
      BUCKET_NAME,
      fileName,
      24 * 60 * 60, // URL expires in 24h
    );
    const uri = url.split("?")[0];
    console.log("Upload successful:", uri); // Log 6
    
    if (!uri) {
      return res
        .status(500)
        .json({ error: "Failed to generate presigned URL" });
    }
    return res.status(200).json({
      success: true,
      url,
      fileName,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Upload failed" });
  }
}
