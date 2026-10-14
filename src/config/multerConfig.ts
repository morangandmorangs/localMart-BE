import multer from "multer";

export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

/** Held in memory and streamed straight to Cloudinary; nothing touches disk. */
export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    cb(null, DOCUMENT_MIME_TYPES.includes(file.mimetype));
  },
});
