const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceiptNote = require('../models/GoodsReceiptNote');
const Invoice = require('../models/Invoice');
const { parseDocument } = require('../services/geminiParser');
const { performMatch } = require('../services/matchingService');
const fs = require('fs');

/**
 * Upload and parse a document
 * POST /documents/upload
 */
async function uploadDocument(req, res) {
    try {
        const { documentType } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!['po', 'grn', 'invoice'].includes(documentType)) {
            // Clean up uploaded file
            fs.unlinkSync(file.path);
            return res.status(400).json({
                error: 'Invalid documentType. Must be one of: po, grn, invoice'
            });
        }

        console.log(`Parsing ${documentType} document: ${file.originalname}`);

        // Parse document using Gemini
        const parsed = await parseDocument(file.path, documentType);

        let savedDoc;

        if (documentType === 'po') {
            // Check for duplicate PO
            const existingPO = await PurchaseOrder.findOne({ poNumber: parsed.poNumber });
            if (existingPO) {
                fs.unlinkSync(file.path);
                return res.status(409).json({
                    error: `PO with number ${parsed.poNumber} already exists`,
                    existingId: existingPO._id
                });
            }

            savedDoc = await PurchaseOrder.create({
                poNumber: parsed.poNumber,
                poDate: new Date(parsed.poDate),
                vendorName: parsed.vendorName,
                vendorAddress: parsed.vendorAddress,
                vendorGstin: parsed.vendorGstin,
                billingAddress: parsed.billingAddress,
                shippingAddress: parsed.shippingAddress,
                paymentTerms: parsed.paymentTerms,
                expectedDeliveryDate: parsed.expectedDeliveryDate ? new Date(parsed.expectedDeliveryDate) : null,
                items: parsed.items,
                rawResponse: parsed,
                originalFileName: file.originalname
            });
        } else if (documentType === 'grn') {
            // Check for duplicate GRN
            const existingGRN = await GoodsReceiptNote.findOne({ grnNumber: parsed.grnNumber });
            if (existingGRN) {
                fs.unlinkSync(file.path);
                return res.status(409).json({
                    error: `GRN with number ${parsed.grnNumber} already exists`,
                    existingId: existingGRN._id
                });
            }

            savedDoc = await GoodsReceiptNote.create({
                grnNumber: parsed.grnNumber,
                poNumber: parsed.poNumber,
                grnDate: new Date(parsed.grnDate),
                vendorName: parsed.vendorName,
                invoiceNumber: parsed.invoiceNumber,
                invoiceDate: parsed.invoiceDate ? new Date(parsed.invoiceDate) : null,
                inboundNumber: parsed.inboundNumber,
                items: parsed.items,
                rawResponse: parsed,
                originalFileName: file.originalname
            });
        } else if (documentType === 'invoice') {
            // Check for duplicate Invoice
            const existingInvoice = await Invoice.findOne({ invoiceNumber: parsed.invoiceNumber });
            if (existingInvoice) {
                fs.unlinkSync(file.path);
                return res.status(409).json({
                    error: `Invoice with number ${parsed.invoiceNumber} already exists`,
                    existingId: existingInvoice._id
                });
            }

            savedDoc = await Invoice.create({
                invoiceNumber: parsed.invoiceNumber,
                poNumber: parsed.poNumber,
                invoiceDate: new Date(parsed.invoiceDate),
                vendorName: parsed.vendorName,
                vendorGstin: parsed.vendorGstin,
                customerName: parsed.customerName,
                customerGstin: parsed.customerGstin,
                items: parsed.items,
                totalTaxableValue: parsed.totalTaxableValue,
                totalCgst: parsed.totalCgst,
                totalSgst: parsed.totalSgst,
                grandTotal: parsed.grandTotal,
                rawResponse: parsed,
                originalFileName: file.originalname
            });
        }

        // Clean up uploaded file after processing
        fs.unlinkSync(file.path);

        // Trigger matching for the poNumber
        const poNumber = parsed.poNumber;
        let matchResult = null;
        try {
            matchResult = await performMatch(poNumber);
        } catch (matchErr) {
            console.error('Match error (non-fatal):', matchErr.message);
        }

        res.status(201).json({
            message: `${documentType.toUpperCase()} document parsed and stored successfully`,
            document: {
                id: savedDoc._id,
                type: documentType,
                poNumber: parsed.poNumber
            },
            parsedData: savedDoc,
            matchResult
        });

    } catch (error) {
        console.error('Upload error:', error);
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
            error: 'Failed to process document',
            details: error.message
        });
    }
}

/**
 * Get a parsed document by ID
 * GET /documents/:id
 */
async function getDocument(req, res) {
    try {
        const { id } = req.params;

        // Try to find in all collections
        let doc = await PurchaseOrder.findById(id);
        if (doc) {
            return res.json({ type: 'po', document: doc });
        }

        doc = await GoodsReceiptNote.findById(id);
        if (doc) {
            return res.json({ type: 'grn', document: doc });
        }

        doc = await Invoice.findById(id);
        if (doc) {
            return res.json({ type: 'invoice', document: doc });
        }

        res.status(404).json({ error: 'Document not found' });
    } catch (error) {
        console.error('Get document error:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid document ID format' });
        }
        res.status(500).json({ error: 'Failed to retrieve document', details: error.message });
    }
}

module.exports = { uploadDocument, getDocument };
