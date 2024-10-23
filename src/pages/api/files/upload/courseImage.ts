// src/pages/api/files/upload/image.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { createReadStream } from 'fs';
import { nanoid } from 'nanoid';
import { createBucketIfNotExists, s3Client } from '~/utils/s3-file-management';
import corsMiddleware from '~/lib/corsMiddleware';

const BUCKET_NAME = 'assets';
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await corsMiddleware(req, res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
    });

    // Parse form data
    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // console.log('file', file);
    
    // Validate file type
    if (!ACCEPTED_IMAGE_TYPES.includes(file.mimetype ?? '')) {
      return res.status(400).json({ error: 'File type not supported' });
    }

    // Create unique filename
    const fileName = `${nanoid(5)}-${file?.originalFilename}`;
    // Create bucket if not exists
    await createBucketIfNotExists(BUCKET_NAME);

    // Upload file to Minio
    const fileStream = createReadStream(file.filepath);
    await s3Client.putObject(BUCKET_NAME, fileName, fileStream, {
      'Content-Type': file.mimetype || 'application/octet-stream',
    });

    // Generate presigned URL
    const url = await s3Client.presignedGetObject(
      BUCKET_NAME, 
      fileName, 
      24 * 60 * 60 // URL expires in 24h
    );

    return res.status(200).json({
      success: true,
      url,
      fileName,
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
}