import type { NextApiRequest, NextApiResponse } from "next";
import corsMiddleware from "~/lib/corsMiddleware";
import { convertHlsStream } from "~/lib/convert";
import { log } from "console";

const BUCKET_NAME = "video";

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
    log("Processing upload...");
    console.log("Request Headers:", req.headers);
    log("Request body:", req.body);
    const { videoUrl } = req.body;
    if (!videoUrl) {
      console.log("No video URL provided");
      return res.status(400).json({ error: "No video URL provided" });
    }
    console.log("Video URL:", videoUrl);
    console.log("Converting video to HLS...");

    const fileName = videoUrl.split("/").pop().split(".")[0];
    const hlsRes = await convertHlsStream({
      source: videoUrl,
      bucketName: BUCKET_NAME,
      folderName: fileName,
    });
    if (!hlsRes) {
      return res.status(500).json({ error: "Failed to convert video to HLS" });
    }
    console.log("HLS conversion complete");
    // console.log("Stream:", hlsRes);
    const streamUrl = `https://share.vinhintw.com/${BUCKET_NAME}/${fileName}/playlist.m3u8`;
    console.log("Stream URL:", streamUrl);
    return res.status(200).json({
      url: streamUrl,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Upload failed" });
  }
}
