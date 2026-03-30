const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceiptNote = require('../models/GoodsReceiptNote');
const Invoice = require('../models/Invoice');

/**
 * Perform three-way match for a given PO number.
 * Matching is done at the item level using itemCode as the key.
 * 
 * @param {string} poNumber - The PO number to match
 * @returns {Object} Match result with status and item-level details
 */
async function performMatch(poNumber) {
    // Fetch all related documents
    const po = await PurchaseOrder.findOne({ poNumber });
    const grns = await GoodsReceiptNote.find({ poNumber });
    const invoices = await Invoice.find({ poNumber });

    // Check for duplicate POs
    const poCount = await PurchaseOrder.countDocuments({ poNumber });

    const result = {
        poNumber,
        status: 'insufficient_documents',
        documents: {
            po: po ? { id: po._id, poNumber: po.poNumber, poDate: po.poDate } : null,
            grns: grns.map(g => ({ id: g._id, grnNumber: g.grnNumber, grnDate: g.grnDate })),
            invoices: invoices.map(i => ({ id: i._id, invoiceNumber: i.invoiceNumber, invoiceDate: i.invoiceDate }))
        },
        mismatches: [],
        itemDetails: [],
        summary: ''
    };

    // If PO not yet uploaded, return insufficient
    if (!po) {
        result.summary = 'PO document not yet uploaded';
        return result;
    }

    // Check for duplicate PO
    if (poCount > 1) {
        result.mismatches.push({
            type: 'duplicate_po',
            message: `Multiple POs found for poNumber ${poNumber} (count: ${poCount})`
        });
    }

    // If no GRN and no Invoice, return insufficient
    if (grns.length === 0 && invoices.length === 0) {
        result.summary = 'No GRN or Invoice documents uploaded yet';
        return result;
    }

    // Build PO items lookup by itemCode
    const poItemsMap = new Map();
    for (const item of po.items) {
        poItemsMap.set(item.itemCode, item);
    }

    // Aggregate GRN quantities by itemCode
    const grnQtyMap = new Map();
    for (const grn of grns) {
        for (const item of grn.items) {
            const current = grnQtyMap.get(item.itemCode) || 0;
            grnQtyMap.set(item.itemCode, current + item.receivedQuantity);
        }
    }

    // Aggregate Invoice quantities by itemCode
    const invoiceQtyMap = new Map();
    for (const invoice of invoices) {
        for (const item of invoice.items) {
            const current = invoiceQtyMap.get(item.itemCode) || 0;
            invoiceQtyMap.set(item.itemCode, current + item.quantity);
        }
    }

    // Collect all unique itemCodes from all documents
    const allItemCodes = new Set([
        ...poItemsMap.keys(),
        ...grnQtyMap.keys(),
        ...invoiceQtyMap.keys()
    ]);

    let matchedCount = 0;
    let mismatchCount = 0;
    const poDate = new Date(po.poDate);

    for (const itemCode of allItemCodes) {
        const poItem = poItemsMap.get(itemCode);
        const totalGrnQty = grnQtyMap.get(itemCode) || 0;
        const totalInvoiceQty = invoiceQtyMap.get(itemCode) || 0;
        const itemMismatches = [];

        // Check if item exists in PO
        if (!poItem) {
            itemMismatches.push({
                type: 'item_missing_in_po',
                message: `Item ${itemCode} found in GRN/Invoice but not in PO`
            });
        }

        const poQty = poItem ? poItem.quantity : 0;

        // Rule 1: GRN quantity must not be greater than PO quantity
        if (poItem && totalGrnQty > poQty) {
            itemMismatches.push({
                type: 'grn_qty_exceeds_po_qty',
                message: `GRN qty (${totalGrnQty}) exceeds PO qty (${poQty})`,
                grnQuantity: totalGrnQty,
                poQuantity: poQty
            });
        }

        // Rule 2: Invoice quantity must not be greater than PO quantity
        if (poItem && totalInvoiceQty > poQty) {
            itemMismatches.push({
                type: 'invoice_qty_exceeds_po_qty',
                message: `Invoice qty (${totalInvoiceQty}) exceeds PO qty (${poQty})`,
                invoiceQuantity: totalInvoiceQty,
                poQuantity: poQty
            });
        }

        // Rule 3: Invoice quantity must not be greater than total GRN quantity
        if (grns.length > 0 && totalInvoiceQty > totalGrnQty) {
            itemMismatches.push({
                type: 'invoice_qty_exceeds_grn_qty',
                message: `Invoice qty (${totalInvoiceQty}) exceeds total GRN qty (${totalGrnQty})`,
                invoiceQuantity: totalInvoiceQty,
                grnQuantity: totalGrnQty
            });
        }

        // Rule 4: Invoice date must not be after PO date
        // (checked once per invoice, not per item, but we report it at the item level)
        for (const invoice of invoices) {
            const invoiceDate = new Date(invoice.invoiceDate);
            // Check if this invoice contains this item
            const invoiceHasItem = invoice.items.some(i => i.itemCode === itemCode);
            if (invoiceHasItem && invoiceDate > poDate) {
                itemMismatches.push({
                    type: 'invoice_date_after_po_date',
                    message: `Invoice ${invoice.invoiceNumber} date (${invoice.invoiceDate.toISOString().split('T')[0]}) is after PO date (${po.poDate.toISOString().split('T')[0]})`,
                    invoiceDate: invoice.invoiceDate,
                    poDate: po.poDate
                });
                break; // Only report once per item
            }
        }

        if (itemMismatches.length === 0) {
            matchedCount++;
        } else {
            mismatchCount++;
            result.mismatches.push(...itemMismatches);
        }

        result.itemDetails.push({
            itemCode,
            description: poItem ? poItem.description : 'Unknown',
            poQuantity: poQty,
            totalGrnQuantity: totalGrnQty,
            totalInvoiceQuantity: totalInvoiceQty,
            status: itemMismatches.length === 0 ? 'matched' : 'mismatch',
            mismatches: itemMismatches
        });
    }

    // Determine overall status
    if (mismatchCount === 0 && matchedCount > 0) {
        result.status = 'matched';
        result.summary = `All ${matchedCount} items matched successfully`;
    } else if (matchedCount > 0 && mismatchCount > 0) {
        result.status = 'partially_matched';
        result.summary = `${matchedCount} items matched, ${mismatchCount} items have mismatches`;
    } else if (mismatchCount > 0) {
        result.status = 'mismatch';
        result.summary = `All ${mismatchCount} items have mismatches`;
    }

    // Add duplicate_po to overall status if found
    if (poCount > 1) {
        result.status = 'mismatch';
    }

    return result;
}

module.exports = { performMatch };
