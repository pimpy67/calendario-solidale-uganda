/**
 * Server.js - Express server per il Calendario Solidale
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

// Inizializza database
const db = require('./database/db');
db.init();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// Stripe webhook ha bisogno del raw body per verificare la firma
app.use('/api/webhook/stripe', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Digital Asset Links per TWA (Google Play)
app.get('/.well-known/assetlinks.json', (req, res) => {
    res.json([{
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {
            "namespace": "android_app",
            "package_name": process.env.TWA_PACKAGE_NAME || "com.casafamigliauganda.calendario",
            "sha256_cert_fingerprints": [
                process.env.TWA_SHA256_FINGERPRINT || "PLACEHOLDER_SHA256_FINGERPRINT"
            ]
        }
    }]);
});

// API Routes
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Serve admin panel
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Fallback per SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: true,
        message: 'Errore interno del server'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   Calendario Solidale - Casa Famiglia Uganda      ║
║                                                   ║
║   Server avviato su http://localhost:${PORT}         ║
║                                                   ║
║   Admin panel: http://localhost:${PORT}/admin        ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
    `);
});

module.exports = app;
