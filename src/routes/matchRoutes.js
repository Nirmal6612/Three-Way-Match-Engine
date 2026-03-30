const express = require('express');
const { getMatchResult } = require('../controllers/matchController');

const router = express.Router();

/**
 * @swagger
 * /match/{poNumber}:
 *   get:
 *     summary: Get three-way match result by PO number
 *     description: Returns the current match status for all documents linked to the given PO number, including item-level details and mismatch reasons.
 *     tags: [Matching]
 *     parameters:
 *       - in: path
 *         name: poNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Purchase Order number
 *         example: CI4PO05788
 *     responses:
 *       200:
 *         description: Match result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 poNumber:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [matched, partially_matched, mismatch, insufficient_documents]
 *                 documents:
 *                   type: object
 *                   properties:
 *                     po:
 *                       type: object
 *                     grns:
 *                       type: array
 *                       items:
 *                         type: object
 *                     invoices:
 *                       type: array
 *                       items:
 *                         type: object
 *                 mismatches:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       message:
 *                         type: string
 *                 itemDetails:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       itemCode:
 *                         type: string
 *                       description:
 *                         type: string
 *                       poQuantity:
 *                         type: number
 *                       totalGrnQuantity:
 *                         type: number
 *                       totalInvoiceQuantity:
 *                         type: number
 *                       status:
 *                         type: string
 *                       mismatches:
 *                         type: array
 *                         items:
 *                           type: object
 *                 summary:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/:poNumber', getMatchResult);

module.exports = router;
