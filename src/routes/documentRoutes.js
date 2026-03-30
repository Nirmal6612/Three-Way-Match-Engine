const express = require('express');
const multer = require('multer');
const path = require('path');
const { uploadDocument, getDocument } = require('../controllers/documentController');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

/**
 * @swagger
 * /documents/upload:
 *   post:
 *     summary: Upload and parse a document
 *     description: Upload a PO, GRN, or Invoice PDF. The document is parsed using Gemini API, stored in MongoDB, and matching is triggered.
 *     tags: [Documents]
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - documentType
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: PDF file to upload
 *               documentType:
 *                 type: string
 *                 enum: [po, grn, invoice]
 *                 description: Type of document
 *     responses:
 *       201:
 *         description: Document parsed and stored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 document:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     type:
 *                       type: string
 *                     poNumber:
 *                       type: string
 *                 parsedData:
 *                   type: object
 *                 matchResult:
 *                   type: object
 *       400:
 *         description: Bad request (missing file or invalid documentType)
 *       409:
 *         description: Duplicate document
 *       500:
 *         description: Server error
 */
router.post('/upload', upload.single('file'), uploadDocument);

/**
 * @swagger
 * /documents/{id}:
 *   get:
 *     summary: Get a parsed document by ID
 *     description: Returns the stored parsed document from any collection (PO, GRN, or Invoice).
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB document ID
 *     responses:
 *       200:
 *         description: Document found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   enum: [po, grn, invoice]
 *                 document:
 *                   type: object
 *       404:
 *         description: Document not found
 *       400:
 *         description: Invalid ID format
 */
router.get('/:id', getDocument);

module.exports = router;
