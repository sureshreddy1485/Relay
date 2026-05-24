const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'application/x-zip-compressed',
    'text/plain',
  ];

  let mime = file.mimetype;
  if (!mime || mime === 'application/octet-stream' || mime === 'image/*') {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (['.jpg', '.jpeg'].includes(ext)) mime = 'image/jpeg';
    else if (ext === '.png') mime = 'image/png';
    else if (ext === '.gif') mime = 'image/gif';
    else if (ext === '.webp') mime = 'image/webp';
    else if (ext === '.mp4') mime = 'video/mp4';
    else if (ext === '.pdf') mime = 'application/pdf';
    else if (['.doc', '.docx'].includes(ext)) mime = 'application/msword';
    else if (ext === '.m4a') mime = 'audio/m4a';
    file.mimetype = mime; // Mutate mimetype for downstream handlers
  }

  if (allowedTypes.includes(mime)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${mime || 'unknown'} not allowed`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

module.exports = upload;
