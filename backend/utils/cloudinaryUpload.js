const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

const uploadToCloudinary = (buffer, folder, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: `relay/${folder}`, resource_type: resourceType },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

/**
 * Detect the Cloudinary resource_type from a publicId or URL.
 * Cloudinary uses:
 *   'image'  — jpg, png, gif, webp, etc.
 *   'video'  — mp4, mov, webm, etc.
 *   'raw'    — mp3, pdf, doc, xls, any other binary
 */
const detectResourceType = (publicIdOrUrl) => {
  const str = (publicIdOrUrl || '').toLowerCase();
  const imageExts = /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|ico|avif|heic)(\?|$)/;
  const videoExts = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)(\?|$)/;
  if (imageExts.test(str)) return 'image';
  if (videoExts.test(str)) return 'video';
  // Also check folder hint from publicId path (relay/images, relay/videos, relay/audio, relay/documents)
  if (str.includes('/images/') || str.includes('/profiles/') || str.includes('/covers/') || str.includes('/groups/') || str.includes('/stories/')) return 'image';
  if (str.includes('/videos/')) return 'video';
  // audio, documents, pdfs → 'raw'
  return 'raw';
};

const deleteFromCloudinary = async (publicIdOrUrl, resourceType = null) => {
  try {
    if (!publicIdOrUrl) return;
    let publicId = publicIdOrUrl;

    // Extract publicId if a full Cloudinary URL is passed
    if (publicId.includes('res.cloudinary.com')) {
      const parts = publicId.split('/');
      const filename = parts.pop(); // e.g., 'abcxyz.jpg' or 'abcxyz.pdf'
      const vIdx = parts.findIndex(p => p.startsWith('v') && !isNaN(p.substring(1)));
      const folderPath = vIdx !== -1 ? parts.slice(vIdx + 1).join('/') : '';
      const id = filename.includes('.') ? filename.split('.').slice(0, -1).join('.') : filename;
      publicId = folderPath ? `${folderPath}/${id}` : id;
    }

    // Auto-detect if caller didn't specify
    const type = resourceType || detectResourceType(publicIdOrUrl);

    await cloudinary.uploader.destroy(publicId, { resource_type: type });
    console.log(`[Cloudinary] Deleted ${type}: ${publicId}`);
  } catch (err) {
    console.error('Cloudinary delete error:', err);
  }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };
