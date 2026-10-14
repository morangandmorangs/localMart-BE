import cloudinary from "./cloudinaryConfig";

/** Uploads a buffer to Cloudinary and returns its https URL. */
export const uploadBuffer = (
  buffer: Buffer,
  folder: string,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed"));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
