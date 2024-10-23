import type { NextApiRequest, NextApiResponse } from "next";
import { env } from "~/env";
import { db } from "~/server/db";
import type { PresignedUrlProp, FileInDBProp } from "~/utils/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Only POST requests are allowed" });
    return;
  }

  const presignedUrls = req.body as PresignedUrlProp[];

  // Get the file name in bucket from the database
  await db.file.createMany({
    data: presignedUrls.map((file: FileInDBProp) => ({
      bucket: env.S3_BUCKET_NAME,
      fileName: file.fileNameInBucket,
      originalName: file.originalFileName,
      size: file.fileSize,
    })),
  });

  const savedFiles = await db.file.findMany({
    where: {
      fileName: {
        in: presignedUrls.map((file: FileInDBProp) => file.fileNameInBucket),
      },
    },
  });

  if (savedFiles.length > 0) {
    const firstFileInfo = savedFiles[0];
    if (firstFileInfo) {
      res.status(200).json({ message: "Files saved successfully", id: firstFileInfo.id });
    } else {
      res.status(404).json({ message: "Files not found" });
    }
  } else {
    res.status(404).json({ message: "Files not found" });
  }
}
