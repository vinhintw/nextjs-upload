import { useState, useRef } from "react";
import {
  validateFiles,
  MAX_FILE_SIZE_S3_ENDPOINT,
  handleUpload,
  getPresignedUrls,
} from "~/utils/fileUploadHelpers";
import { UploadDropzone } from "./UploadDropzone";
import { FileProps, type ShortFileProp } from "~/utils/types";

type UploadFilesFormProps = {
  onUploadSuccess: () => void;
};

export function FileUpload({
  onUploadSuccess,
}: UploadFilesFormProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  async function getPresignedUrl(file: FileProps) {
    console.log("Start getPresignedUrl");
    const response = await fetch(`/api/files/download/presignedUrl/${file}`);
    console.log("response", response.json());
    return (await response.json()) as string;
  }
  const uploadToServer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // check if files are selected
    console.log("Start uploadToServer");
    if (!fileInputRef.current?.files?.length) {
      alert("Please, select file you want to upload");
      return;
    }
    // get File[] from FileList
    const files = Object.values(fileInputRef.current.files);
    // validate files
    const filesInfo: ShortFileProp[] = files.map((file) => ({
      originalFileName: file.name,
      fileSize: file.size,
    }));

    const filesValidationResult = validateFiles(
      filesInfo,
      MAX_FILE_SIZE_S3_ENDPOINT,
    );
    if (filesValidationResult) {
      alert(filesValidationResult);
      return;
    }
    setIsLoading(true);
    console.log("Start getPresignedUrls");
    const presignedUrls = await getPresignedUrls(filesInfo);
    console.log("presignedUrls", presignedUrls);
    if (!presignedUrls?.length) {
      alert("Something went wrong, please try again later");
      return;
    }

    // upload files to s3 endpoint directly and save file info to db
    console.log("Start handleUpload");
    const res = await handleUpload(files, presignedUrls, onUploadSuccess);
    const presignedUrl = await getPresignedUrl(res);
    console.log("presignedUrl", presignedUrl);
    setFileUrl(presignedUrl);
    setIsLoading(false);
  };

  return (
    <div>
      <UploadDropzone
        isLoading={isLoading}
        fileInputRef={fileInputRef}
        uploadToServer={uploadToServer}
        maxFileSize={MAX_FILE_SIZE_S3_ENDPOINT}
      />
    </div>
  );
}
