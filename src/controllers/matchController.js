const { performMatch } = require('../services/matchingService');

/**
 * Get three-way match result by PO number
 * GET /match/:poNumber
 */
async function getMatchResult(req, res) {
    try {
        const { poNumber } = req.params;

        if (!poNumber) {
            return res.status(400).json({ error: 'poNumber is required' });
        }

        const result = await performMatch(poNumber);
        res.json(result);
    } catch (error) {
        console.error('Match error:', error);
        res.status(500).json({
            error: 'Failed to perform matching',
            details: error.message
        });
    }
}

module.exports = { getMatchResult };
