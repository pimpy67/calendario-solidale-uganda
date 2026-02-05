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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

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
