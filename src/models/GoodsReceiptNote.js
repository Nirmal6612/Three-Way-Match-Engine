const mongoose = require('mongoose');

const grnItemSchema = new mongoose.Schema({
    itemCode: { type: String, required: true },
    description: { type: String },
    receivedQuantity: { type: Number, required: true },
    expectedQuantity: { type: Number },
    unitPrice: { type: Number },
    lotNumber: { type: String },
    mrp: { type: Number },
    taxableValue: { type: Number },
    totalAmount: { type: Number }
});

const goodsReceiptNoteSchema = new mongoose.Schema({
    grnNumber: { type: String, required: true },
    poNumber: { type: String, required: true },
    grnDate: { type: Date, required: true },
    vendorName: { type: String },
    invoiceNumber: { type: String },
    invoiceDate: { type: Date },
    inboundNumber: { type: String },
    items: [grnItemSchema],
    rawResponse: { type: Object },
    originalFileName: { type: String }
}, { timestamps: true });

// Allow multiple GRNs per PO
goodsReceiptNoteSchema.index({ poNumber: 1 });
goodsReceiptNoteSchema.index({ grnNumber: 1 }, { unique: true });

module.exports = mongoose.model('GoodsReceiptNote', goodsReceiptNoteSchema);
