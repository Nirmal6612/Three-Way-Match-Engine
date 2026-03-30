const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Three-Way Match Engine API',
            version: '1.0.0',
            description: 'Backend service for uploading PO, GRN, and Invoice documents, extracting structured data using Gemini API, storing in MongoDB, and performing three-way matching.',
            contact: {
                name: 'API Support'
            }
        },
        servers: [
            {
                url: `http://localhost:${process.env.PORT || 3000}`,
                description: 'Local development server'
            }
        ]
    },
    apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
