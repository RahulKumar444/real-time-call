const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const auth = require('../middleware/auth');

const router = express.Router();

// --- Multer configuration ---------------------------------------------------

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (_req, file, cb) => {
    // Create a unique filename: timestamp-random + original extension
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  },
});

// --- Routes -----------------------------------------------------------------

// POST /api/files/upload
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileDoc = await File.create({
      originalName: req.file.originalname,
      fileName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user.id,
      roomId: req.body.roomId || 'general',
    });

    res.status(201).json({
      id: fileDoc.id,
      _id: fileDoc._id,
      originalName: fileDoc.originalName,
      fileName: fileDoc.fileName,
      mimeType: fileDoc.mimeType,
      size: fileDoc.size,
      uploadedBy: fileDoc.uploadedBy,
      roomId: fileDoc.roomId,
      createdAt: fileDoc.createdAt || new Date().toISOString(),
    });
  } catch (err) {
    console.error('File upload error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/files/:id
router.get('/:id', async (req, res) => {
  try {
    const fileDoc = await File.findById(req.params.id);
    if (!fileDoc) {
      return res.status(404).json({ message: 'File not found' });
    }

    const filePath = path.join(__dirname, '../../uploads', fileDoc.fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }

    res.set({
      'Content-Type': fileDoc.mimeType,
      'Content-Disposition': `attachment; filename="${fileDoc.originalName}"`,
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  } catch (err) {
    console.error('File download error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
