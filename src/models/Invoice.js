const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
    itemCode: { type: String, required: true },
    description: { type: String },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number },
    hsnCode: { type: String },
    taxableValue: { type: Number },
    cgstRate: { type: Number },
    cgstAmount: { type: Number },
    sgstRate: { type: Number },
    sgstAmount: { type: Number },
    totalAmount: { type: Number }
});

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true },
    poNumber: { type: String, required: true },
    invoiceDate: { type: Date, required: true },
    vendorName: { type: String },
    vendorGstin: { type: String },
    customerName: { type: String },
    customerGstin: { type: String },
    items: [invoiceItemSchema],
    totalTaxableValue: { type: Number },
    totalCgst: { type: Number },
    totalSgst: { type: Number },
    grandTotal: { type: Number },
    rawResponse: { type: Object },
    originalFileName: { type: String }
}, { timestamps: true });

// Allow multiple Invoices per PO
invoiceSchema.index({ poNumber: 1 });
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
