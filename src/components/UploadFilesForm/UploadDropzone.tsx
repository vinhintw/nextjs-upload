import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { IoCloudUploadOutline } from "react-icons/io5";
import { type UploadFilesFormUIProps as UploadDropzoneIProps } from "~/utils/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Icons } from "~/components/icons";
import { cn } from "~/lib/utils";
export function UploadDropzone({
  isLoading,
  fileInputRef, 
  uploadToServer,
  maxFileSize,
}: UploadDropzoneIProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setDragActive(false);
      if (acceptedFiles.length > 0) {
        setSelectedFile(acceptedFiles[0] || null);
        if (fileInputRef.current) {
          const dataTransfer = new DataTransfer();
          if (acceptedFiles[0]) {
            dataTransfer.items.add(acceptedFiles[0]);
          }
          fileInputRef.current.files = dataTransfer.files;
        }
      }
    },
    [fileInputRef],
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".gif"],
    },
    maxSize: maxFileSize * 1024 * 1024,
    multiple: false,
  });

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedFile) {
      await uploadToServer(event);
      removeSelectedFile();
    }
  };
  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  return (
    <form className="mx-auto h-full max-w-md space-y-3" onSubmit={handleSubmit}>
      <div
        {...getRootProps()}
        className={cn(
          "aspect-w-16 aspect-h-9 flex aspect-video flex-col items-center justify-center rounded-lg border-2 border-dashed p-4",
          dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300",
          "transition-all duration-200 ease-in-out",
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
      >
        <label htmlFor="dropzone-file">
          {!selectedFile ? (
            <div className="text-center">
              <div className="mx-auto max-w-min rounded-md border p-2">
                <IoCloudUploadOutline size="1.6em" />
              </div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold">
                  Choose files or drag and drop
                </span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-400">
                Image({maxFileSize}MB)
              </p>
            </div>
          ) : (
            <div className="text-center">
              <div className="mx-auto max-w-min rounded-md border p-2">
                <IoCloudUploadOutline size="1.6em" />
              </div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold">
                  <span className="truncate">{selectedFile.name}</span>
                </span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-400">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant={"upload"}
                  type="submit"
                  disabled={isLoading}
                  size={"lg"}
                >
                  {isLoading ? (
                    <Icons.spinner className="h-4 w-4 animate-spin" />
                  ) : (
                    "Upload"
                  )}
                </Button>
              </div>
            </div>
          )}
        </label>
        <Input
          {...getInputProps()}
          id="dropzone-file"
          type="file"
          className="hidden"
          disabled={isLoading}
          ref={fileInputRef}
        />
      </div>
    </form>
  );
}
