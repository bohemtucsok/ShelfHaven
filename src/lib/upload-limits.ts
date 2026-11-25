/** Maximum size of an uploaded e-book file (shared by upload and metadata preview). */
export const MAX_UPLOAD_FILE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Extra bytes allowed on top of the file size for a multipart/form-data body
 * (boundaries, part headers, small text fields).
 */
export const MULTIPART_OVERHEAD_ALLOWANCE = 64 * 1024; // 64KB
