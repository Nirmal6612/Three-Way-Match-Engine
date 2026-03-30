const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const PO_PROMPT = `You are a document parser. Extract structured data from this Purchase Order (PO) PDF.

Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "poNumber": "string",
  "poDate": "YYYY-MM-DD",
  "vendorName": "string",
  "vendorAddress": "string",
  "vendorGstin": "string",
  "billingAddress": "string",
  "shippingAddress": "string",
  "paymentTerms": "string",
  "expectedDeliveryDate": "YYYY-MM-DD or null",
  "items": [
    {
      "itemCode": "string (the SKU code/Item Code number)",
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "hsnCode": "string",
      "mrp": number,
      "taxableValue": number,
      "totalAmount": number
    }
  ]
}

IMPORTANT:
- itemCode should be the numeric SKU/Item Code (e.g., "11423", "18003", "4459")
- quantity must be a number
- unitPrice is the unit base cost
- Parse ALL items from ALL pages
- Dates should be in YYYY-MM-DD format
- Return ONLY the JSON object, nothing else`;

const GRN_PROMPT = `You are a document parser. Extract structured data from this Goods Receipt Note (GRN) PDF.

Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "grnNumber": "string",
  "poNumber": "string",
  "grnDate": "YYYY-MM-DD",
  "vendorName": "string",
  "invoiceNumber": "string or null",
  "invoiceDate": "YYYY-MM-DD or null",
  "inboundNumber": "string or null",
  "items": [
    {
      "itemCode": "string (the SKU Code number)",
      "description": "string",
      "receivedQuantity": number,
      "expectedQuantity": number,
      "unitPrice": number,
      "lotNumber": "string or null",
      "mrp": number,
      "taxableValue": number,
      "totalAmount": number
    }
  ]
}

IMPORTANT:
- itemCode should be the numeric SKU Code (e.g., "11423", "18003", "4459")
- receivedQuantity is the "Recv Qty" column
- expectedQuantity is the "Exp Qty" column
- Parse ALL items from ALL pages
- Dates should be in YYYY-MM-DD format
- Return ONLY the JSON object, nothing else`;

const INVOICE_PROMPT = `You are a document parser. Extract structured data from this Invoice PDF.

Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "invoiceNumber": "string",
  "poNumber": "string (the Customer Order No.)",
  "invoiceDate": "YYYY-MM-DD",
  "vendorName": "string",
  "vendorGstin": "string",
  "customerName": "string",
  "customerGstin": "string",
  "items": [
    {
      "itemCode": "string (the Item Code)",
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "hsnCode": "string",
      "taxableValue": number,
      "cgstRate": number,
      "cgstAmount": number,
      "sgstRate": number,
      "sgstAmount": number,
      "totalAmount": number
    }
  ],
  "totalTaxableValue": number,
  "totalCgst": number,
  "totalSgst": number,
  "grandTotal": number
}

IMPORTANT:
- itemCode should be the Item Code from the invoice (e.g., "FG-P-F-0503", "FG-M-F-1703"). These are the vendor's internal codes.
- Also look for any numeric SKU references if available
- quantity is the Qty column
- unitPrice is the Rate column
- Parse ALL items from ALL pages
- Dates should be in YYYY-MM-DD format
- Return ONLY the JSON object, nothing else`;

/**
 * Parse a PDF document using Gemini API
 * @param {string} filePath - Path to the uploaded PDF file
 * @param {string} documentType - Type of document: 'po', 'grn', 'invoice'
 * @returns {Object} Parsed structured JSON
 */
async function parseDocument(filePath, documentType, retries = 3) {
  const prompts = {
    po: PO_PROMPT,
    grn: GRN_PROMPT,
    invoice: INVOICE_PROMPT
  };

  const prompt = prompts[documentType];
  if (!prompt) {
    throw new Error(`Unknown document type: ${documentType}`);
  }

  // Read file as base64
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`  Gemini API attempt ${attempt}/${retries} for ${documentType}...`);

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Data
          }
        },
        prompt
      ]);

      const response = result.response;
      const text = response.text();

      // Clean up response - remove markdown code blocks if present
      let cleanedText = text.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.slice(7);
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.slice(3);
      }
      if (cleanedText.endsWith('```')) {
        cleanedText = cleanedText.slice(0, -3);
      }
      cleanedText = cleanedText.trim();

      const parsed = JSON.parse(cleanedText);
      console.log(`  ✅ Successfully parsed ${documentType} on attempt ${attempt}`);
      return parsed;

    } catch (error) {
      lastError = error;
      const is429 = error.message && error.message.includes('429');
      const isRateLimit = error.message && error.message.includes('quota');

      if ((is429 || isRateLimit) && attempt < retries) {
        // Extract retry delay from error message or use exponential backoff
        let waitTime = Math.pow(2, attempt) * 20; // 40s, 80s, 160s
        const retryMatch = error.message.match(/retry in ([\d.]+)s/i);
        if (retryMatch) {
          waitTime = Math.ceil(parseFloat(retryMatch[1])) + 5;
        }
        console.log(`  ⏳ Rate limited. Waiting ${waitTime}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      } else if (attempt < retries) {
        console.log(`  ⚠️ Error on attempt ${attempt}: ${error.message}. Retrying in 5s...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  throw lastError;
}

module.exports = { parseDocument };
