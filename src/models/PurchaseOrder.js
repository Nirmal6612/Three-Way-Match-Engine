const mongoose = require('mongoose');

const poItemSchema = new mongoose.Schema({
  itemCode: { type: String, required: true },
  description: { type: String },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number },
  hsnCode: { type: String },
  mrp: { type: Number },
  taxableValue: { type: Number },
  totalAmount: { type: Number }
});

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: { type: String, required: true, unique: true },
  poDate: { type: Date, required: true },
  vendorName: { type: String },
  vendorAddress: { type: String },
  vendorGstin: { type: String },
  billingAddress: { type: String },
  shippingAddress: { type: String },
  paymentTerms: { type: String },
  expectedDeliveryDate: { type: Date },
  items: [poItemSchema],
  rawResponse: { type: Object },
  originalFileName: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
