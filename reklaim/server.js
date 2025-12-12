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

// Returns Intelligence Dashboard - Fetch data from Boltic workflow
// Risk Map Data API - Aggregate returns data by location
app.get('/api/risk-map-data', async (req, res) => {
    try {
        const bolticWorkflowUrl = 'https://asia-south1.workflow.boltic.app/fc2e653e-295d-41a9-a2c7-d9b3dfbdb55f';

        const response = await axios.get(bolticWorkflowUrl, {
            timeout: 50000,
            headers: { 'Accept': 'application/json' }
        });

        let allJudgments = [];

        // Handle API response structure - check both root level and response_body wrapper
        let latestData = null;
        if (response.data && response.data.latest_data) {
            // New structure: latest_data at root level
            latestData = response.data.latest_data;
        } else if (response.data && response.data.response_body && response.data.response_body.latest_data) {
            // Old structure: nested under response_body
            latestData = response.data.response_body.latest_data;
        }

        if (latestData) {
            // Extract judgments - handle multiple API structures
            if (latestData.judgments && Array.isArray(latestData.judgments) && latestData.judgments.length > 0) {
                const firstItem = latestData.judgments[0];
                // Check if judgments contains objects with returns_analysis (old structure)
                if (firstItem.returns_analysis && Array.isArray(firstItem.returns_analysis)) {
                    allJudgments = firstItem.returns_analysis;
                } else if (firstItem.shipment_id) {
                    // New structure: judgments is directly an array of judgment objects
                    allJudgments = latestData.judgments;
                }
            }
        }

        // Aggregate risk data by state and pincode
        const locationRiskData = {};

        allJudgments.forEach((judgment) => {
            const state = judgment.delivery_state || 'Unknown';
            const pincode = judgment.delivery_pincode || 'Unknown';

            if (!locationRiskData[state]) {
                locationRiskData[state] = {
                    state: state,
                    pincodes: {},
                    totalReturns: 0,
                    highRiskCount: 0,
                    totalFraudScore: 0,
                    centerLat: getStateCenterLat(state),
                    centerLng: getStateCenterLng(state)
                };
            }

            if (!locationRiskData[state].pincodes[pincode]) {
                locationRiskData[state].pincodes[pincode] = {
                    pincode: pincode,
                    returns: 0,
                    highRiskCount: 0,
                    totalFraudScore: 0,
                    locations: []
                };
            }

            const pincodeData = locationRiskData[state].pincodes[pincode];
            const flagCount = judgment.key_flags?.length || 0;
            const fraudScore = judgment.fraud_score || 0;

            // Add coordinates for pincode location (approximate)
            if (pincode !== 'Unknown' && pincode.length === 6) {
                const coords = getPincodeCoordinates(pincode);
                pincodeData.locations.push({
                    lat: coords.lat,
                    lng: coords.lng,
                    fraudScore: fraudScore,
                    flagCount: flagCount,
                    shipmentId: judgment.shipment_id
                });
            }

            pincodeData.returns += 1;
            pincodeData.totalFraudScore += fraudScore;

            if (flagCount >= 3) {
                pincodeData.highRiskCount += 1;
                locationRiskData[state].highRiskCount += 1;
            }

            locationRiskData[state].totalReturns += 1;
            locationRiskData[state].totalFraudScore += fraudScore;
        });

        // Calculate averages and format final data
        const riskMapData = Object.values(locationRiskData).map(stateData => {
            const avgFraudScore = stateData.totalReturns > 0 ?
                (stateData.totalFraudScore / stateData.totalReturns).toFixed(1) : 0;

            const pincodes = Object.values(stateData.pincodes).map(pincodeData => {
                const avgFraudScore = pincodeData.returns > 0 ?
                    (pincodeData.totalFraudScore / pincodeData.returns).toFixed(1) : 0;

                // Get average coordinates if multiple locations exist
                let avgLat = stateData.centerLat;
                let avgLng = stateData.centerLng;

                if (pincodeData.locations.length > 0) {
                    const sumLat = pincodeData.locations.reduce((sum, loc) => sum + loc.lat, 0);
                    const sumLng = pincodeData.locations.reduce((sum, loc) => sum + loc.lng, 0);
                    avgLat = (sumLat / pincodeData.locations.length).toFixed(6);
                    avgLng = (sumLng / pincodeData.locations.length).toFixed(6);
                }

                return {
                    pincode: pincodeData.pincode,
                    returns: pincodeData.returns,
                    highRiskCount: pincodeData.highRiskCount,
                    avgFraudScore: parseFloat(avgFraudScore),
                    riskLevel: pincodeData.highRiskCount >= 3 ? 'high' :
                        pincodeData.highRiskCount >= 1 ? 'medium' : 'low',
                    coordinates: {
                        lat: parseFloat(avgLat),
                        lng: parseFloat(avgLng)
                    }
                };
            });

            return {
                state: stateData.state,
                totalReturns: stateData.totalReturns,
                highRiskCount: stateData.highRiskCount,
                avgFraudScore: parseFloat(avgFraudScore),
                riskLevel: stateData.highRiskCount >= 5 ? 'high' :
                    stateData.highRiskCount >= 2 ? 'medium' : 'low',
                pincodes: pincodes.filter(p => p.pincode !== 'Unknown')
            };
        });

        return res.json({
            success: true,
            data: riskMapData,
            totalStates: riskMapData.length,
            totalHighRiskLocations: riskMapData.reduce((sum, s) =>
                sum + s.pincodes.filter(p => p.riskLevel === 'high').length, 0)
        });

    } catch (err) {
        console.error('Risk map data fetch error:', err.message);
        return res.json({
            success: true,
            data: getFallbackRiskData(),
            totalStates: 28,
            totalHighRiskLocations: 15
        });
    }
});

// Helper functions for mapping Indian locations
function getStateCenterLat(state) {
    const stateCenters = {
        'Maharashtra': 19.7515, 'Karnataka': 15.3173, 'Tamil Nadu': 11.1271,
        'Delhi': 28.7041, 'Uttar Pradesh': 26.8467, 'West Bengal': 22.9868,
        'Gujarat': 22.2587, 'Rajasthan': 27.0238, 'Madhya Pradesh': 22.9734,
        'Andhra Pradesh': 15.9129, 'Telangana': 18.1124, 'Kerala': 10.8505,
        'Punjab': 31.1471, 'Haryana': 29.0588, 'Bihar': 25.0961,
        'Odisha': 20.9517, 'Chhattisgarh': 21.2787, 'Jharkhand': 23.6102,
        'Uttarakhand': 30.0668, 'Himachal Pradesh': 31.1048, 'Jammu and Kashmir': 34.0837,
        'Goa': 15.2993, 'Mizoram': 23.1645, 'Manipur': 24.6637, 'Meghalaya': 25.4670,
        'Nagaland': 26.1584, 'Arunachal Pradesh': 28.2180, 'Sikkim': 27.5330,
        'Tripura': 23.9408, 'Assam': 26.2006, 'Puducherry': 11.9416,
        'Chandigarh': 30.7333, 'Andaman and Nicobar Islands': 11.7401,
        'Dadra and Nagar Haveli and Daman and Diu': 20.1809, 'Lakshadweep': 10.5667,
        'Ladakh': 34.1526, 'Unknown': 20.5937
    };
    return stateCenters[state] || 20.5937;
}

function getStateCenterLng(state) {
    const stateCenters = {
        'Maharashtra': 75.7139, 'Karnataka': 75.7139, 'Tamil Nadu': 78.6569,
        'Delhi': 77.1025, 'Uttar Pradesh': 80.9462, 'West Bengal': 87.8550,
        'Gujarat': 71.1924, 'Rajasthan': 74.2179, 'Madhya Pradesh': 78.6569,
        'Andhra Pradesh': 79.0193, 'Telangana': 79.0193, 'Kerala': 76.9386,
        'Punjab': 75.3412, 'Haryana': 76.7176, 'Bihar': 85.3131,
        'Odisha': 85.0975, 'Chhattisgarh': 81.8661, 'Jharkhand': 85.2799,
        'Uttarakhand': 78.2676, 'Himachal Pradesh': 77.1734, 'Jammu and Kashmir': 74.8216,
        'Goa': 74.1240, 'Mizoram': 92.9376, 'Manipur': 93.9063, 'Meghalaya': 91.3662,
        'Nagaland': 94.5624, 'Arunachal Pradesh': 94.7278, 'Sikkim': 88.5122,
        'Tripura': 91.9882, 'Assam': 92.9376, 'Puducherry': 79.8083,
        'Chandigarh': 76.7794, 'Andaman and Nicobar Islands': 92.6586,
        'Dadra and Nagar Haveli and Daman and Diu': 73.0169, 'Lakshadweep': 72.6369,
        'Ladakh': 77.5772, 'Unknown': 78.9629
    };
    return stateCenters[state] || 78.9629;
}

function getPincodeCoordinates(pincode) {
    // Generate approximate coordinates based on pincode
    // This is a simplified mapping - in production, you'd use a proper pincode-to-coordinates API
    if (pincode.length !== 6 || !/^\d+$/.test(pincode)) {
        return { lat: 20.5937, lng: 78.9629 }; // Default to center of India
    }

    const firstTwoDigits = parseInt(pincode.substring(0, 2));
    const lastFourDigits = parseInt(pincode.substring(2, 6));

    // Rough geographic distribution based on pincode zones
    let baseLat, baseLng;

    if (firstTwoDigits >= 10 && firstTwoDigits <= 17) {
        // North India
        baseLat = 28 + (lastFourDigits / 10000) * 8;
        baseLng = 70 + (lastFourDigits / 10000) * 15;
    } else if (firstTwoDigits >= 18 && firstTwoDigits <= 28) {
        // East India
        baseLat = 20 + (lastFourDigits / 10000) * 10;
        baseLng = 85 + (lastFourDigits / 10000) * 8;
    } else if (firstTwoDigits >= 30 && firstTwoDigits <= 39) {
        // West India
        baseLat = 18 + (lastFourDigits / 10000) * 12;
        baseLng = 68 + (lastFourDigits / 10000) * 12;
    } else if (firstTwoDigits >= 40 && firstTwoDigits <= 68) {
        // South India
        baseLat = 8 + (lastFourDigits / 10000) * 15;
        baseLng = 76 + (lastFourDigits / 10000) * 8;
    } else {
        // Default fallback
        baseLat = 20 + (lastFourDigits / 10000) * 15;
        baseLng = 75 + (lastFourDigits / 10000) * 15;
    }

    return {
        lat: parseFloat(baseLat.toFixed(6)),
        lng: parseFloat(baseLng.toFixed(6))
    };
}

function getFallbackRiskData() {
    return [
        {
            state: 'Maharashtra',
            totalReturns: 45,
            highRiskCount: 8,
            avgFraudScore: 6.2,
            riskLevel: 'high',
            pincodes: [
                {
                    pincode: '400001',
                    returns: 12,
                    highRiskCount: 3,
                    avgFraudScore: 7.1,
                    riskLevel: 'high',
                    coordinates: { lat: 18.9220, lng: 72.8347 }
                },
                {
                    pincode: '411001',
                    returns: 8,
                    highRiskCount: 2,
                    avgFraudScore: 5.8,
                    riskLevel: 'medium',
                    coordinates: { lat: 18.5204, lng: 73.8567 }
                }
            ]
        },
        {
            state: 'Delhi',
            totalReturns: 32,
            highRiskCount: 5,
            avgFraudScore: 5.9,
            riskLevel: 'medium',
            pincodes: [
                {
                    pincode: '110001',
                    returns: 15,
                    highRiskCount: 3,
                    avgFraudScore: 6.4,
                    riskLevel: 'high',
                    coordinates: { lat: 28.6139, lng: 77.2090 }
                },
                {
                    pincode: '110092',
                    returns: 6,
                    highRiskCount: 1,
                    avgFraudScore: 4.2,
                    riskLevel: 'medium',
                    coordinates: { lat: 28.6505, lng: 77.2311 }
                }
            ]
        },
        {
            state: 'Karnataka',
            totalReturns: 28,
            highRiskCount: 4,
            avgFraudScore: 5.1,
            riskLevel: 'medium',
            pincodes: [
                {
                    pincode: '560001',
                    returns: 14,
                    highRiskCount: 2,
                    avgFraudScore: 5.7,
                    riskLevel: 'medium',
                    coordinates: { lat: 12.9716, lng: 77.5946 }
                }
            ]
        }
    ];
}

app.get('/api/returns', async (req, res) => {
    try {
        const bolticWorkflowUrl = 'https://asia-south1.workflow.boltic.app/fc2e653e-295d-41a9-a2c7-d9b3dfbdb55f';

        console.log('📊 Fetching returns intelligence data from Boltic...');

        const response = await axios.get(bolticWorkflowUrl, {
            timeout: 50000, // 50 seconds to accommodate 30-40s API response time
            headers: { 'Accept': 'application/json' }
        });

        console.log('✅ Boltic API response received');

        // NEW API structure: { response_body: { latest_data: { judgments: [...] }, metadata: {...} } }
        let allJudgments = [];
        let latestSummary = {};
        let metadata = {};

        // Handle API response structure - check both root level and response_body wrapper
        let latestData = null;
        if (response.data && response.data.latest_data) {
            // New structure: latest_data at root level
            latestData = response.data.latest_data;
            if (response.data.metadata) {
                metadata = response.data.metadata;
            }
        } else if (response.data && response.data.response_body && response.data.response_body.latest_data) {
            // Old structure: nested under response_body
            latestData = response.data.response_body.latest_data;
            if (response.data.response_body.metadata) {
                metadata = response.data.response_body.metadata;
            }
        }

        if (latestData) {
            // Extract judgments - handle multiple API structures
            if (latestData.judgments && Array.isArray(latestData.judgments) && latestData.judgments.length > 0) {
                const firstItem = latestData.judgments[0];
                // Check if judgments contains objects with returns_analysis (old structure)
                if (firstItem.returns_analysis && Array.isArray(firstItem.returns_analysis)) {
                    allJudgments = firstItem.returns_analysis;
                    // Use the batch_summary from the first judgment (old structure)
                    if (firstItem.batch_summary) {
                        latestSummary = firstItem.batch_summary;
                    }
                } else if (firstItem.shipment_id) {
                    // New structure: judgments is directly an array of judgment objects
                    allJudgments = latestData.judgments;
                }
            }
            // Get summary from latest_data.summary (new structure)
            if (latestData.summary) {
                latestSummary = latestData.summary;
            }

            console.log(`📋 Found ${allJudgments.length} judgments from latest data (record: ${metadata.record_id || 'N/A'})`);

            // Transform judgments to dashboard format
            const returns = allJudgments.map((judgment, index) => ({
                id: judgment.shipment_id || `return-${index}`,
                order_id: judgment.order_id,
                user_id: judgment.user_id || 'anonymous',
                user_name: judgment.user_name || (judgment.user_id === 'undefined' || !judgment.user_id ? 'Anonymous User' : `User ${judgment.user_id}`),
                user_email: judgment.user_email || 'N/A',
                user_mobile: judgment.user_mobile || 'N/A',
                shipment_id: judgment.shipment_id,
                item_name: 'Fashion Item', // Would come from order details in real scenario
                refund_amount: judgment.refund_amount || 0,
                total_value: judgment.total_value || 0,
                payment_mode: 'COD',
                is_cod: judgment.key_flags?.includes('high_cod_dependency') || judgment.key_flags?.includes('exclusive_cod_user'),
                delivery_city: judgment.delivery_state || 'Unknown',
                delivery_pincode: judgment.delivery_pincode || '400001',
                delivery_state: judgment.delivery_state,
                reason_text: judgment.explanation || 'Return requested',
                segment: judgment.segment,
                fraud_score: judgment.fraud_score,
                decision: judgment.decision,
                confidence: judgment.confidence,
                pattern_flags: judgment.key_flags || [],
                flag_count: judgment.key_flags?.length || 0,
                incentive: judgment.incentive,
                recommended_action: judgment.recommended_action,
                reasoning: judgment.reasoning,
                weighted_breakdown: judgment.weighted_breakdown,
                prime_score: judgment.prime_score
            }));

            // Calculate summary statistics - handle both old (decisions.reject) and new (reject_count) structures
            const rejectCount = latestSummary.reject_count ?? latestSummary.decisions?.reject ?? 0;
            const approveCount = latestSummary.approve_count ?? latestSummary.decisions?.approve ?? 0;
            const reviewCount = latestSummary.review_count ?? latestSummary.decisions?.manual_review ?? 0;
            const totalAnalyzed = latestSummary.total_analyzed || allJudgments.length;

            const dashboardSummary = {
                analyzed_returns: totalAnalyzed,
                total_value: returns.reduce((sum, r) => sum + r.refund_amount, 0),
                avg_return_rate: totalAnalyzed > 0 ? Math.round((rejectCount / totalAnalyzed) * 100) : 0,
                avg_fraud_score: latestSummary.avg_fraud_score || 0,
                exclusive_cod_users: returns.filter(r =>
                    r.pattern_flags.includes('exclusive_cod_user') || r.pattern_flags.includes('exclusive_cod')
                ).length,
                high_risk_count: returns.filter(r => r.flag_count >= 3).length,
                reject_count: rejectCount,
                approve_count: approveCount,
                review_count: reviewCount
            };

            return res.json({
                success: true,
                summary: dashboardSummary,
                returns: returns,
                metadata: metadata
            });
        } else {
            // Fallback: Try old API structure for backward compatibility
            if (response.data && response.data.data && Array.isArray(response.data.data)) {
                response.data.data.forEach(item => {
                    if (item.output) {
                        if (item.output.judgments && Array.isArray(item.output.judgments)) {
                            allJudgments = allJudgments.concat(item.output.judgments);
                        }
                        if (item.output.summary) {
                            latestSummary = item.output.summary;
                        }
                    }
                });

                console.log(`📋 Found ${allJudgments.length} judgments from ${response.data.data.length} records (old format)`);

                // Transform and return using old format
                const returns = allJudgments.map((judgment, index) => ({
                    id: judgment.shipment_id || `return-${index}`,
                    order_id: judgment.order_id,
                    user_id: judgment.user_id || 'anonymous',
                    user_name: judgment.user_name || (judgment.user_id === 'undefined' || !judgment.user_id ? 'Anonymous User' : `User ${judgment.user_id}`),
                    user_email: judgment.user_email || 'N/A',
                    user_mobile: judgment.user_mobile || 'N/A',
                    shipment_id: judgment.shipment_id,
                    item_name: 'Fashion Item',
                    refund_amount: Math.floor(Math.random() * 2000) + 500,
                    payment_mode: 'COD',
                    is_cod: judgment.key_flags?.includes('high_cod_dependency') || judgment.key_flags?.includes('exclusive_cod_user'),
                    delivery_city: judgment.delivery_state || 'Unknown',
                    delivery_pincode: judgment.delivery_pincode || '400001',
                    delivery_state: judgment.delivery_state,
                    reason_text: judgment.explanation || 'Return requested',
                    segment: judgment.segment,
                    fraud_score: judgment.fraud_score,
                    decision: judgment.decision,
                    confidence: judgment.confidence,
                    pattern_flags: judgment.key_flags || [],
                    flag_count: judgment.key_flags?.length || 0,
                    incentive: judgment.incentive,
                    recommended_action: judgment.recommended_action,
                    reasoning: judgment.reasoning,
                    weighted_breakdown: judgment.weighted_breakdown,
                    prime_score: judgment.prime_score
                }));

                const dashboardSummary = {
                    analyzed_returns: latestSummary.total_analyzed || allJudgments.length,
                    total_value: returns.reduce((sum, r) => sum + r.refund_amount, 0),
                    avg_return_rate: latestSummary.total_analyzed ? Math.round((latestSummary.reject_count / latestSummary.total_analyzed) * 100) : 0,
                    avg_fraud_score: latestSummary.avg_fraud_score || 0,
                    exclusive_cod_users: returns.filter(r => r.pattern_flags.includes('exclusive_cod_user')).length,
                    high_risk_count: returns.filter(r => r.flag_count >= 3).length,
                    reject_count: latestSummary.reject_count || 0,
                    approve_count: latestSummary.approve_count || 0,
                    review_count: latestSummary.review_count || 0
                };

                return res.json({
                    success: true,
                    summary: dashboardSummary,
                    returns: returns
                });
            }
        }

        // Fallback if response structure is unexpected
        console.warn('⚠️ Unexpected API response structure:', JSON.stringify(response.data).substring(0, 200));
        return res.json({
            success: true,
            summary: {
                analyzed_returns: 0,
                total_value: 0,
                avg_return_rate: 0,
                exclusive_cod_users: 0,
                high_risk_count: 0
            },
            returns: []
        });

    } catch (err) {
        console.error('❌ Returns dashboard fetch error:', err.message);

        // Return empty data instead of error to keep UI functional
        return res.json({
            success: true,
            summary: {
                analyzed_returns: 0,
                total_value: 0,
                avg_return_rate: 0,
                exclusive_cod_users: 0,
                high_risk_count: 0
            },
            returns: [],
            error: 'Unable to fetch latest data'
        });
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
