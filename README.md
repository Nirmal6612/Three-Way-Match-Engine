# Three-Way Match Engine

A backend service that allows users to upload Purchase Order (PO), Goods Receipt Note (GRN), and Invoice documents, extract structured data using **Gemini API**, store the extracted data in **MongoDB**, and perform a **three-way match** at the item level.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (via Mongoose)
- **AI/ML**: Google Gemini API (`gemini-2.0-flash`) for PDF parsing
- **Documentation**: Swagger/OpenAPI via swagger-jsdoc + swagger-ui-express

## Known Issue

This project uses Google Gemini API (free tier).
Due to API rate limits and token limits, large document uploads may fail with a 429 error.

In such cases:
- Try smaller documents
- Wait for quota reset
- Or use a different API key / paid plan

## Quick Start

### Prerequisites
- Node.js (v18+)
- MongoDB (local or Atlas)
- Google Gemini API key

### Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd three-way-match-engine

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your MONGODB_URI and GEMINI_API_KEY

# 4. Start the server
npm start
```

The server starts on `http://localhost:3000`. Swagger docs available at `http://localhost:3000/api-docs`.

## API Endpoints

### 1. Upload Document — `POST /documents/upload`

Upload a PDF and specify its type. The document is parsed via Gemini, stored in MongoDB, and matching is triggered automatically.

**Request** (multipart/form-data):
| Field | Type | Description |
|-------|------|-------------|
| `file` | File | PDF document |
| `documentType` | String | `po`, `grn`, or `invoice` |

**Example (curl):**
```bash
curl -X POST http://localhost:3000/documents/upload \
  -F "file=@PO.pdf" \
  -F "documentType=po"
```

### 2. Get Document — `GET /documents/:id`

Retrieve a stored parsed document by its MongoDB ID.

```bash
curl http://localhost:3000/documents/<document_id>
```

### 3. Get Match Result — `GET /match/:poNumber`

Get the three-way match result for a given PO number.

```bash
curl http://localhost:3000/match/CI4PO05788
```

## Approach

### Data Model

The system uses three MongoDB collections:

| Collection | Key Fields | Notes |
|-----------|-----------|-------|
| **PurchaseOrder** | `poNumber` (unique), `poDate`, `vendorName`, `items[]` | One PO per poNumber |
| **GoodsReceiptNote** | `grnNumber` (unique), `poNumber`, `grnDate`, `items[]` | Multiple GRNs per PO |
| **Invoice** | `invoiceNumber` (unique), `poNumber`, `invoiceDate`, `items[]` | Multiple Invoices per PO |

### Parsing Flow

1. User uploads a PDF with a `documentType` label
2. The PDF is read as base64 and sent to **Gemini 2.0 Flash** with a document-type-specific prompt
3. Gemini extracts structured JSON with fields like `poNumber`, `items[]` (with `itemCode`, `quantity`, etc.)
4. The response is cleaned (strip markdown code blocks if present), parsed as JSON, and saved to MongoDB
5. Matching is automatically triggered after each upload

### Item Matching Key

**`itemCode` (SKU Code)** is used as the matching key across all three document types.

**Rationale**: The SKU codes (e.g., `11423`, `4459`, `18003`) are numeric identifiers that appear consistently in PO, GRN, and Invoice documents. They represent the same product across all documents and are the most reliable way to link line items. While the Invoice uses vendor-internal codes (e.g., `FG-P-F-0503`), the Gemini prompt is designed to extract the numeric SKU codes when available.

### Matching Logic

For each `poNumber`, matching is performed **at the item level** using these validation rules:

| Rule | Validation |
|------|-----------|
| `grn_qty_exceeds_po_qty` | Sum of GRN receivedQuantity ≤ PO quantity |
| `invoice_qty_exceeds_po_qty` | Sum of Invoice quantity ≤ PO quantity |
| `invoice_qty_exceeds_grn_qty` | Sum of Invoice quantity ≤ Sum of GRN receivedQuantity |
| `invoice_date_after_po_date` | Invoice date ≤ PO date |
| `item_missing_in_po` | Item in GRN/Invoice must exist in PO |
| `duplicate_po` | Only one PO per poNumber |

**Match Statuses:**
- `matched` — All items pass all validations
- `partially_matched` — Some items pass, some fail
- `mismatch` — All items have issues
- `insufficient_documents` — PO not uploaded, or no GRN and no Invoice

### Out-of-Order Uploads

Documents can arrive in **any order** (e.g., Invoice before PO, GRN before Invoice). The system handles this by:

1. **Storing documents independently** — Each document is saved to its own collection regardless of whether related documents exist
2. **Lazy matching** — Matching is re-evaluated on every upload and on every `GET /match/:poNumber` request
3. **No prerequisite enforcement** — You can upload a GRN or Invoice even if the PO hasn't been uploaded yet

## Assumptions

1. **Item codes are numeric SKU codes** — The matching assumes Gemini will extract consistent numeric item codes across all document types
2. **Single currency (INR)** — All monetary values are in Indian Rupees
3. **Date format** — Gemini is instructed to return dates in YYYY-MM-DD format
4. **PDF quality** — Documents are expected to be machine-readable PDFs (not scanned images)
5. **One PO per poNumber** — Duplicate PO uploads for the same poNumber are rejected with a 409 error

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Using Gemini for parsing | Flexible but non-deterministic; different runs may produce slightly different results |
| `itemCode` as match key | Simple and effective for these documents, but may need a fuzzy matching fallback for other vendors |
| Re-evaluating match on every request | Always up-to-date but slightly slower than caching; acceptable for this scale |
| No authentication | Simplifies the assignment scope but not production-ready |
| Storing raw Gemini response | Uses more storage but enables debugging and re-processing |

## What I Would Improve With More Time

1. **Fuzzy item matching** — Use description similarity + unit price matching as a fallback when item codes don't match exactly
2. **Retry logic for Gemini** — Add exponential backoff for API rate limits
3. **Background processing** — Use a job queue (Bull/BullMQ) for PDF parsing to avoid request timeouts on large documents
4. **Caching match results** — Store computed match results and invalidate on new uploads
5. **Authentication & authorization** — Add JWT-based auth for API access
6. **Unit & integration tests** — Add Jest test suite with mock Gemini responses
7. **Webhook notifications** — Notify external systems when match status changes
8. **Support for multiple file formats** — Accept images, Excel, CSV in addition to PDF
9. **Dashboard UI** — A simple frontend to visualize match status and upload documents

## Project Structure

```
├── .env.example         # Environment template
├── package.json
├── README.md
├── samples/             # Sample parsed JSON and match results
│   ├── parsed_po.json
│   ├── parsed_grn.json
│   ├── parsed_invoice.json
│   └── match_result.json
└── src/
    ├── app.js           # Express app entry point
    ├── config/
    │   └── swagger.js   # Swagger/OpenAPI configuration
    ├── controllers/
    │   ├── documentController.js
    │   └── matchController.js
    ├── models/
    │   ├── PurchaseOrder.js
    │   ├── GoodsReceiptNote.js
    │   └── Invoice.js
    ├── routes/
    │   ├── documentRoutes.js
    │   └── matchRoutes.js
    └── services/
        ├── geminiParser.js      # Gemini API PDF parsing
        └── matchingService.js   # Three-way matching logic
```

## Sample Outputs

See the `samples/` directory for:
- `parsed_po.json` — Example Gemini output for a Purchase Order
- `parsed_grn.json` — Example Gemini output for a GRN
- `parsed_invoice.json` — Example Gemini output for an Invoice
- `match_result.json` — Example three-way match result
