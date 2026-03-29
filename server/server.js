/**
 * Server.js - Express server per il Calendario Solidale
 */

require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

// Inizializza database
const db = require('./database/db');
db.init();

// Avvia scheduler gift card
const { startGiftCardScheduler } = require('./jobs/giftCardScheduler');
startGiftCardScheduler();

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
            "package_name": process.env.TWA_PACKAGE_NAME || "app.railway.up.calendario_solidale_effata.twa",
            "sha256_cert_fingerprints": [
                process.env.TWA_SHA256_FINGERPRINT || "2F:30:EA:39:32:FD:0A:BB:3B:5C:D9:84:07:BD:72:52:33:1B:F3:0B:D3:AD:49:6F:95:71:F3:5D:A9:46:6F:44"
            ]
        }
    }]);
});

// API Routes
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Serve admin panel
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Pagina successo pagamento
app.get('/payment-success', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/payment-success.html'));
});

// Pagina cancellamento pagamento (torna al calendario)
app.get('/payment-cancel', (req, res) => {
    res.redirect('/');
});

// Pagina gift card condivisibile (con OG tags per anteprima WhatsApp/social)
app.get('/gift-card/:paymentId', (req, res) => {
    const donation = db.getDonationByPaymentId(req.params.paymentId);
    if (!donation || donation.payment_status !== 'completed' || !donation.is_gift) {
        return res.status(404).send('<html><body style="font-family:sans-serif;text-align:center;padding:50px"><h2>Gift card non trovata</h2></body></html>');
    }

    const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const baseUrl = process.env.BASE_URL || 'https://calendario.effataitalia.it';
    const cardNumber = (donation.gift_card_design || 'card1').replace('card', '');
    const giftCardImageUrl = `${baseUrl}/images/gift_card/${cardNumber}.webp`;
    const recipientName = donation.gift_recipient_name || 'Amico/a';
    const donorName = donation.is_anonymous ? 'Un amico generoso' : (donation.donor_name || 'Un amico generoso');
    const dateStr = `${donation.day} ${MONTHS[donation.month - 1]} ${donation.year}`;

    res.send(`<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gift Card per ${recipientName} 🎁</title>
    <meta property="og:type" content="website">
    <meta property="og:title" content="🎁 Un regalo speciale per ${recipientName}!">
    <meta property="og:description" content="${donorName} ti ha regalato il ${dateStr} del Calendario Solidale della Casa Famiglia Effatà in Uganda ❤">
    <meta property="og:image" content="${giftCardImageUrl}">
    <meta property="og:image:width" content="800">
    <meta property="og:image:height" content="600">
    <meta property="og:url" content="${baseUrl}/gift-card/${donation.payment_id}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${giftCardImageUrl}">
</head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;">
    <div style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);margin:20px;">
        <div style="background:linear-gradient(135deg,#2e7d32,#4caf50);padding:30px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:24px;">Calendario Solidale</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:15px;">Effatà Children's Home - Uganda</p>
        </div>
        <div style="padding:24px;">
            <img src="${giftCardImageUrl}" alt="Gift Card" style="width:100%;border-radius:12px;display:block;margin-bottom:20px;">
            <p style="font-size:18px;color:#333;margin:0 0 12px;">Caro/a <strong>${recipientName}</strong>,</p>
            <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;"><strong>${donorName}</strong> ti ha regalato il <strong>${dateStr}</strong> del Calendario Solidale in tuo nome ❤</p>
            ${donation.message ? `<div style="border-left:4px solid #4caf50;padding:12px 16px;background:#fafafa;border-radius:0 8px 8px 0;margin-bottom:20px;font-style:italic;color:#444;">"${donation.message}"<br><span style="color:#888;font-size:13px;">— ${donorName}</span></div>` : ''}
            <div style="background:#e8f5e9;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px;">
                <p style="color:#2e7d32;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Giorno adottato</p>
                <p style="color:#1b5e20;font-size:28px;font-weight:700;margin:0 0 8px;">${dateStr}</p>
                <p style="color:#2e7d32;font-size:13px;margin:0;">Donazione di 50,00 €</p>
            </div>
            <div style="background:#fff8e1;border-radius:10px;padding:16px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.6;">
                ❤ Questa donazione aiuta a garantire <strong>cibo, istruzione e cure</strong> ai bambini della Casa Famiglia Effatà in Uganda. Ogni giorno adottato fa la differenza!<br><br>
                <strong>GRAZIE!</strong><br>
                <a href="https://www.effatacharityorganisation.org/" style="color:#2e7d32;">www.effatacharityorganisation.org</a>
            </div>
            ${donation.email ? `
            <div style="text-align:center;">
                <p style="color:#555;font-size:13px;margin:0 0 12px;">Vuoi inviare questa gift card per email a <strong>${recipientName}</strong>?</p>
                <button onclick="sendToRecipient()" id="sendBtn"
                    style="background:#1976D2;color:#fff;border:none;padding:14px 28px;border-radius:50px;font-size:15px;font-weight:700;cursor:pointer;">
                    ✉️ Invia Gift Card per Email
                </button>
                <p id="sendMsg" style="margin:10px 0 0;font-size:13px;color:#555;display:none;"></p>
            </div>
            <script>
            function sendToRecipient() {
                var btn = document.getElementById('sendBtn');
                var msg = document.getElementById('sendMsg');
                btn.disabled = true;
                btn.textContent = 'Invio in corso...';
                fetch('/api/send-gift/${donation.payment_id}', { method: 'POST' })
                    .then(function(r){ return r.json(); })
                    .then(function(data){
                        if (data.success) {
                            btn.style.display = 'none';
                            msg.style.display = 'block';
                            msg.style.color = '#2e7d32';
                            msg.textContent = '✅ Gift card inviata a ${donation.email}!';
                        } else {
                            btn.disabled = false;
                            btn.textContent = '✉️ Invia Gift Card per Email';
                            msg.style.display = 'block';
                            msg.style.color = '#c62828';
                            msg.textContent = 'Errore: ' + (data.message || 'Riprova');
                        }
                    })
                    .catch(function(){ btn.disabled = false; btn.textContent = '✉️ Invia Gift Card per Email'; });
            }
            </script>` : ''}
        </div>
    </div>
</body>
</html>`);
});

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
