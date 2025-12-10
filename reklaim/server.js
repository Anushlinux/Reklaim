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

// Public product endpoints (no FDK auth required, for home page access)
// These endpoints attempt to use FDK session if available, otherwise return demo data
app.get('/api/public/products', async (req, res) => {
    try {
        const companyId = req.headers['x-company-id'] || '1';

        // Try to get platformClient if session exists
        try {
            const platformClient = await fdkExtension.getPlatformClient(companyId);
            if (platformClient) {
                const data = await platformClient.catalog.getProducts();
                return res.json(data);
            }
        } catch (sessionErr) {
            console.log('No valid session, returning demo products');
        }

        // Return demo products if no session
        return res.json({
            items: [
                {
                    id: 'demo-001',
                    name: 'Premium Cotton Classic Fit Shirt',
                    brand: { name: 'StyleCraft' },
                    category_slug: 'apparel',
                    item_code: 'SC-SHIRT-001',
                    is_active: true,
                    price: { effective: 1299, min: 1299 },
                    media: [{ type: 'image', url: 'https://images.pexels.com/photos/991509/pexels-photo-991509.jpeg?w=400' }]
                },
                {
                    id: 'demo-002',
                    name: 'Wireless Bluetooth Headphones',
                    brand: { name: 'SoundWave' },
                    category_slug: 'electronics',
                    item_code: 'SW-HEAD-002',
                    is_active: true,
                    price: { effective: 2499, min: 2499 },
                    media: [{ type: 'image', url: 'https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg?w=400' }]
                },
                {
                    id: 'demo-003',
                    name: 'Running Sports Shoes',
                    brand: { name: 'FlexRun' },
                    category_slug: 'footwear',
                    item_code: 'FR-SHOE-003',
                    is_active: true,
                    price: { effective: 3999, min: 3999 },
                    media: [{ type: 'image', url: 'https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg?w=400' }]
                },
                {
                    id: 'demo-004',
                    name: 'Leather Messenger Bag',
                    brand: { name: 'UrbanCarry' },
                    category_slug: 'accessories',
                    item_code: 'UC-BAG-004',
                    is_active: true,
                    price: { effective: 4599, min: 4599 },
                    media: [{ type: 'image', url: 'https://images.pexels.com/photos/1152077/pexels-photo-1152077.jpeg?w=400' }]
                },
                {
                    id: 'demo-005',
                    name: 'Smart Fitness Watch',
                    brand: { name: 'TechFit' },
                    category_slug: 'electronics',
                    item_code: 'TF-WATCH-005',
                    is_active: false,
                    price: { effective: 5999, min: 5999 },
                    media: [{ type: 'image', url: 'https://images.pexels.com/photos/437037/pexels-photo-437037.jpeg?w=400' }]
                }
            ],
            page: { current: 1, total: 1, has_next: false }
        });
    } catch (err) {
        console.error('Public products fetch error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/public/products/application/:application_id', async (req, res) => {
    try {
        const companyId = req.headers['x-company-id'] || '1';
        const { application_id } = req.params;

        // Try to get platformClient if session exists
        try {
            const platformClient = await fdkExtension.getPlatformClient(companyId);
            if (platformClient) {
                const data = await platformClient.application(application_id).catalog.getAppProducts();
                return res.json(data);
            }
        } catch (sessionErr) {
            console.log('No valid session, returning demo products for application');
        }

        // Return demo products if no session
        return res.json({
            items: [
                {
                    id: 'app-demo-001',
                    name: 'Casual Denim Jacket',
                    brand: { name: 'DenimCo' },
                    category_slug: 'apparel',
                    item_code: 'DC-JACKET-001',
                    is_active: true,
                    price: { effective: 2999, min: 2999 },
                    media: [{ type: 'image', url: 'https://images.pexels.com/photos/1040945/pexels-photo-1040945.jpeg?w=400' }]
                },
                {
                    id: 'app-demo-002',
                    name: 'Portable Power Bank',
                    brand: { name: 'ChargePlus' },
                    category_slug: 'electronics',
                    item_code: 'CP-POWER-002',
                    is_active: true,
                    price: { effective: 1599, min: 1599 },
                    media: [{ type: 'image', url: 'https://images.pexels.com/photos/4195325/pexels-photo-4195325.jpeg?w=400' }]
                }
            ],
            page: { current: 1, total: 1, has_next: false }
        });
    } catch (err) {
        console.error('Public application products fetch error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Demo/Test endpoint to simulate return webhook
app.post('/api/simulate-return', async (req, res) => {
    try {
        const { scenario = 'clean', company_id = '1', reason, comments } = req.body;

        // Build mock payload based on scenario
        const isFraud = scenario === 'fraud';

        const mockPayload = {
            event: 'return.requested',
            company_id,
            return_id: `RTN-${Date.now().toString(36).toUpperCase()}`,
            order_id: `ORD-2024-${Math.floor(Math.random() * 90000) + 10000}`,
            customer_id: isFraud ? 'cust_suspicious_001' : 'cust_verified_042',

            customer: {
                id: isFraud ? 'cust_suspicious_001' : 'cust_verified_042',
                name: isFraud ? 'John Doe' : 'Sarah Johnson',
                email: isFraud ? 'temp_email_xyz@tempmail.com' : 'sarah.johnson@gmail.com',
                phone: isFraud ? '+91 0000000000' : '+91 9876543210',
                account_age_days: isFraud ? 3 : 847,
                previous_returns: isFraud ? 12 : 1,
                total_orders: isFraud ? 14 : 23,
                return_rate: isFraud ? '85.7%' : '4.3%'
            },

            order: {
                id: `ORD-2024-${Math.floor(Math.random() * 90000) + 10000}`,
                total: 1299,
                placed_at: new Date(Date.now() - (isFraud ? 2 : 5) * 24 * 60 * 60 * 1000).toISOString()
            },

            product: {
                id: 'prod_shirt_001',
                name: 'Premium Cotton Classic Fit Shirt',
                variant: 'Size: L • Color: Navy Blue',
                price: 1299,
                category: 'Apparel'
            },

            return_details: {
                reason: reason || (isFraud ? 'color' : 'size'),
                reason_text: isFraud ? 'Wrong color received' : 'Size too small',
                comments: comments || (isFraud ? 'Product is totally different from what I ordered!!!' : 'Would like to exchange for XL if possible.'),
                requested_at: new Date().toISOString()
            },

            risk_indicators: isFraud ? {
                new_account: true,
                high_return_rate: true,
                mismatched_address: true,
                temp_email: true,
                rapid_returns: true
            } : {
                new_account: false,
                high_return_rate: false,
                mismatched_address: false,
                temp_email: false,
                rapid_returns: false
            },

            amount: 1299,
            scenario,
            images: isFraud
                ? ['https://images.pexels.com/photos/991509/pexels-photo-991509.jpeg']
                : ['https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg']
        };

        // Fetch config for this company
        const configKey = `boltic_config_${company_id}`;
        const configData = await configStorage.get(configKey);
        const config = configData ? JSON.parse(configData) : {};
        const bolticUrl = config.boltic_url || process.env.BOLTIC_URL;

        // Check if URL is properly configured
        if (!bolticUrl || bolticUrl.includes('YOUR_WORKFLOW_ID') || bolticUrl.trim() === '') {
            // Return success with mock data for demo purposes (no actual backend call)
            return res.json({
                success: true,
                message: 'Return request simulated successfully (demo mode)',
                payload: mockPayload,
                demo_mode: true
            });
        }

        // Build enriched payload with merchant rules
        const enrichedPayload = {
            ...mockPayload,
            merchant_rules: config.rules || { auto_approve_threshold: 500, enable_ai: true },
            timestamp: new Date().toISOString()
        };

        // Forward to Boltic
        console.log('🔵 Sending to Boltic workflow...');
        console.log('📦 Payload:', JSON.stringify(enrichedPayload, null, 2));

        try {
            const bolticResponse = await axios.post(bolticUrl, enrichedPayload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            console.log('✅ Return request sent successfully:', mockPayload.return_id);

            // Return clean response without exposing internal URLs
            res.json({
                success: true,
                message: 'Return request submitted successfully',
                payload: mockPayload
            });
        } catch (bolticError) {
            console.error('❌ Workflow Error:', bolticError.response?.status || bolticError.message);

            // Still return success to user - backend error is internal
            res.json({
                success: true,
                message: 'Return request received and is being processed',
                payload: mockPayload,
                note: 'Processing may take a moment'
            });
        }
    } catch (err) {
        console.error('Simulate return error:', err.message);
        res.status(500).json({ success: false, error: 'Unable to process return request. Please try again.' });
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
