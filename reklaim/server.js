const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require("path");
const sqlite3 = require('sqlite3').verbose();
const serveStatic = require("serve-static");
const { readFileSync } = require('fs');
const { setupFdk } = require("@gofynd/fdk-extension-javascript/express");
const { SQLiteStorage } = require("@gofynd/fdk-extension-javascript/express/storage");
const sqliteInstance = new sqlite3.Database('session_storage.db');
const productRouter = express.Router();

// Create storage instance for config management
const configStorage = new SQLiteStorage(sqliteInstance, "exapmple-fynd-platform-extension");



const fdkExtension = setupFdk({
    api_key: process.env.EXTENSION_API_KEY,
    api_secret: process.env.EXTENSION_API_SECRET,
    base_url: process.env.EXTENSION_BASE_URL,
    cluster: process.env.FP_API_DOMAIN,
    callbacks: {
        auth: async (req) => {
            // Write you code here to return initial launch url after auth process complete
            if (req.query.application_id)
                return `${req.extension.base_url}/company/${req.query['company_id']}/application/${req.query.application_id}`;
            else
                return `${req.extension.base_url}/company/${req.query['company_id']}`;
        },

        uninstall: async (req) => {
            // Write your code here to cleanup data related to extension
            // If task is time taking then process it async on other process.
        }
    },
    storage: new SQLiteStorage(sqliteInstance, "exapmple-fynd-platform-extension"), // add your prefix
    access_mode: "offline",
    webhook_config: {
        api_path: "/api/webhook-events",
        notification_email: "useremail@example.com",
        event_map: {
            "company/product/delete": {
                "handler": (eventName) => { console.log(eventName) },
                "version": '1'
            }
        }
    },
});

const STATIC_PATH = process.env.NODE_ENV === 'production'
    ? path.join(process.cwd(), 'frontend', 'public', 'dist')
    : path.join(process.cwd(), 'frontend');

const app = express();
const platformApiRoutes = fdkExtension.platformApiRoutes;

// Middleware to parse cookies with a secret key
app.use(cookieParser("ext.session"));

// Middleware to parse JSON bodies with a size limit of 2mb
app.use(bodyParser.json({
    limit: '2mb'
}));

// Serve static files from the React dist directory
app.use(serveStatic(STATIC_PATH, { index: false }));

// FDK extension handler and API routes (extension launch routes)
app.use("/", fdkExtension.fdkHandler);

// Route to handle webhook events and process it.
app.post('/api/webhook-events', async function (req, res) {
    try {
        const eventName = req.body.event || req.body.event_name;
        console.log(`Webhook Event: ${eventName} received from company ${req.body.company_id}`);

        // Process standard FDK events
        await fdkExtension.webhookRegistry.processWebhook(req);

        // Boltic forwarding for returns
        if (eventName === 'return.requested') {
            const companyId = req.body.company_id;

            try {
                // Fetch stored config
                const configKey = `boltic_config_${companyId}`;
                const configData = await configStorage.get(configKey);
                const config = configData ? JSON.parse(configData) : {};
                const bolticUrl = config.boltic_url || process.env.BOLTIC_URL;

                if (!bolticUrl) {
                    console.warn('No Boltic URL configured for company', companyId);
                    return res.status(200).json({ success: true, warning: 'No Boltic URL' });
                }

                // Get platform access token
                const accessToken = await fdkExtension.getAccessToken(companyId);

                // Build enriched payload
                const payload = {
                    ...req.body,
                    merchant_rules: config.rules || { auto_approve_threshold: 500, enable_ai: true },
                    access_token: accessToken,
                    timestamp: new Date().toISOString()
                };

                // Forward to Boltic
                const bolticResponse = await axios.post(bolticUrl, payload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                });

                console.log('✅ Forwarded to Boltic:', payload.return_id, '| Status:', bolticResponse.status);
            } catch (bolticError) {
                console.error('❌ Boltic forward failed:', bolticError.message);
                // Don't fail webhook - log and continue
            }
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Webhook processing error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

productRouter.get('/', async function view(req, res, next) {
    try {
        const {
            platformClient
        } = req;
        const data = await platformClient.catalog.getProducts()
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

// Get products list for application
productRouter.get('/application/:application_id', async function view(req, res, next) {
    try {
        const {
            platformClient
        } = req;
        const { application_id } = req.params;
        const data = await platformClient.application(application_id).catalog.getAppProducts()
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

// FDK extension api route which has auth middleware and FDK client instance attached to it.
platformApiRoutes.use('/products', productRouter);

// If you are adding routes outside of the /api path, 
// remember to also add a proxy rule for them in /frontend/vite.config.js
// Configuration endpoints for Returns Guardian
app.post('/api/config/:company_id', async (req, res) => {
    try {
        const { company_id } = req.params;
        const { boltic_url, rules } = req.body;

        const configKey = `boltic_config_${company_id}`;
        await configStorage.set(
            configKey,
            JSON.stringify({ boltic_url, rules, updated_at: new Date().toISOString() })
        );

        console.log('Config saved for company', company_id);
        return res.json({ success: true, message: 'Configuration saved' });
    } catch (err) {
        console.error('Config save error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/config/:company_id', async (req, res) => {
    try {
        const { company_id } = req.params;
        const configKey = `boltic_config_${company_id}`;
        const configData = await configStorage.get(configKey);

        if (configData) {
            const config = JSON.parse(configData);
            return res.json(config);
        } else {
            return res.json({ boltic_url: '', rules: { auto_approve_threshold: 500 } });
        }
    } catch (err) {
        console.error('Config fetch error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Demo/Test endpoint to simulate return webhook
app.post('/api/simulate-return', async (req, res) => {
    try {
        const { scenario = 'random', company_id = '1' } = req.body;

        const mockPayload = {
            event: 'return.requested',
            company_id,
            return_id: `test_${Date.now()}`,
            order_id: `ord_${Date.now()}`,
            customer_id: 'cust_demo',

            // Add customer object if your workflow expects it
            customer: {
                id: 'cust_demo',
                name: 'Test Customer',
                email: 'test@example.com'
            },

            // Add order object if needed
            order: {
                id: `ord_${Date.now()}`,
                total: 1299
            },

            // Add product object if needed
            product: {
                id: 'prod_123',
                name: 'Test Product'
            },

            amount: 1299,
            reason_text: scenario === 'fraud' ? 'Wrong color' : 'Size too small',
            scenario,
            images: scenario === 'fraud'
                ? ['https://images.pexels.com/photos/991509/pexels-photo-991509.jpeg']
                : ['https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg']
        };

        // Fetch config for this company
        const configKey = `boltic_config_${company_id}`;
        const configData = await configStorage.get(configKey);
        const config = configData ? JSON.parse(configData) : {};
        const bolticUrl = config.boltic_url || process.env.BOLTIC_URL;

        // Check if URL is properly configured (not empty or placeholder)
        if (!bolticUrl || bolticUrl.includes('YOUR_WORKFLOW_ID') || bolticUrl.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'No Boltic URL configured. Please configure a valid Boltic workflow URL in Settings first.'
            });
        }

        // Build enriched payload with merchant rules
        const enrichedPayload = {
            ...mockPayload,
            merchant_rules: config.rules || { auto_approve_threshold: 500, enable_ai: true },
            timestamp: new Date().toISOString()
        };

        // Forward directly to Boltic
        console.log('🔵 Sending to Boltic:', bolticUrl);
        console.log('📦 Payload:', JSON.stringify(enrichedPayload, null, 2));

        try {
            const bolticResponse = await axios.post(bolticUrl, enrichedPayload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            console.log('✅ Test webhook sent to Boltic:', mockPayload.return_id, '| Status:', bolticResponse.status);

            res.json({
                success: true,
                message: `Test ${scenario} case sent to Boltic successfully`,
                payload: mockPayload,
                boltic_status: bolticResponse.status
            });
        } catch (bolticError) {
            // Log detailed error information for debugging
            console.error('❌ Boltic Error Details:');
            console.error('   Status:', bolticError.response?.status);
            console.error('   Status Text:', bolticError.response?.statusText);
            console.error('   Error Message:', bolticError.message);
            console.error('   Response Data:', JSON.stringify(bolticError.response?.data, null, 2));

            // If Boltic returns an error, still report success but include the error
            res.json({
                success: false,
                message: `Test sent to Boltic but received error response`,
                payload: mockPayload,
                boltic_error: bolticError.response?.status || bolticError.message,
                boltic_error_details: bolticError.response?.data,
                note: 'Check server logs for full error details. Common issues: workflow expects different payload format, workflow is disabled, or authentication required.'
            });
        }
    } catch (err) {
        console.error('Simulate return error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.use('/api', platformApiRoutes);

// Serve the React app for all other routes
app.get('*', (req, res) => {
    return res
        .status(200)
        .set("Content-Type", "text/html")
        .send(readFileSync(path.join(STATIC_PATH, "index.html")));
});

module.exports = app;
