/**
 * API Routes - Endpoints per gestire le donazioni
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { sendGiftCard, sendDonationNotification } = require('../utils/mailer');

// Configurazione Satispay
const SATISPAY_ENABLED = process.env.SATISPAY_API_KEY ? true : false;
const SATISPAY_API_URL = process.env.SATISPAY_SANDBOX === 'true'
    ? 'https://staging.authservices.satispay.com'
    : 'https://authservices.satispay.com';

// Configurazione Stripe
const STRIPE_ENABLED = process.env.STRIPE_SECRET_KEY ? true : false;
let stripe = null;
if (STRIPE_ENABLED) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

/**
 * GET /api/stats
 * Healthcheck endpoint for Railway
 */
router.get('/stats', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /api/donations/by-session/:sessionId
 * Ottieni donazione tramite Stripe session_id (per pagina successo)
 */
router.get('/donations/by-session/:sessionId', (req, res) => {
    try {
        const donation = db.getDonationBySessionId(req.params.sessionId);
        if (!donation || donation.payment_status !== 'completed') {
            return res.status(404).json({ error: true, message: 'Donazione non trovata' });
        }
        res.json({
            id: donation.id,
            day: donation.day,
            month: donation.month,
            year: donation.year,
            donor_name: donation.is_anonymous ? 'Anonimo' : donation.donor_name,
            is_gift: donation.is_gift,
            gift_recipient_name: donation.gift_recipient_name,
            gift_card_design: donation.gift_card_design,
            payment_status: donation.payment_status
        });
    } catch (error) {
        console.error('Errore GET by-session:', error);
        res.status(500).json({ error: true, message: 'Errore nel recupero della donazione' });
    }
});

/**
 * GET /api/donations/detail/:id
 * Ottieni dettagli di una singola donazione (per pagina successo)
 * NOTA: deve stare PRIMA delle route con :year/:month per evitare conflitti
 */
router.get('/donations/detail/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const donation = db.getDonationById(id);

        if (!donation) {
            return res.status(404).json({ error: true, message: 'Donazione non trovata' });
        }

        // Restituisci solo dati pubblici
        res.json({
            id: donation.id,
            day: donation.day,
            month: donation.month,
            year: donation.year,
            donor_name: donation.is_anonymous ? 'Anonimo' : donation.donor_name,
            is_gift: donation.is_gift,
            gift_recipient_name: donation.gift_recipient_name,
            gift_card_design: donation.gift_card_design,
            payment_status: donation.payment_status
        });
    } catch (error) {
        console.error('Errore GET donation detail:', error);
        res.status(500).json({ error: true, message: 'Errore nel recupero della donazione' });
    }
});

/**
 * GET /api/donations/export
 * Esporta tutte le donazioni completate in CSV per il gestionale
 */
router.get('/donations/export', (req, res) => {
    try {
        // Protezione con password admin
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (!adminPassword || req.query.password !== adminPassword) {
            return res.status(401).json({ error: true, message: 'Password non valida' });
        }

        const year = req.query.year ? parseInt(req.query.year) : null;
        const donations = db.exportDonations(year);

        const headers = ['ID', 'Giorno', 'Mese', 'Anno', 'Nome', 'Cognome', 'Codice Fiscale', 'Email', 'Importo', 'Stato Pagamento', 'ID Pagamento', 'Data Creazione'];
        const csvRows = [headers.join(';')];

        for (const d of donations) {
            csvRows.push([
                d.id,
                d.day,
                d.month,
                d.year,
                `"${(d.donor_name || '').replace(/"/g, '""')}"`,
                `"${(d.donor_surname || '').replace(/"/g, '""')}"`,
                `"${(d.donor_cf || '').replace(/"/g, '""')}"`,
                `"${(d.donor_email || '').replace(/"/g, '""')}"`,
                d.amount,
                d.payment_status,
                d.payment_id,
                d.created_at
            ].join(';'));
        }

        const csv = csvRows.join('\n');
        const filename = year ? `donazioni_${year}.csv` : 'donazioni_tutte.csv';

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv); // BOM per Excel
    } catch (error) {
        console.error('Errore export CSV:', error);
        res.status(500).json({ error: true, message: 'Errore nell\'export' });
    }
});

/**
 * GET /api/donations/:year
 * Ottieni tutte le donazioni di un anno
 */
router.get('/donations/:year', (req, res) => {
    try {
        const year = parseInt(req.params.year);

        if (isNaN(year) || year < 2020 || year > 2100) {
            return res.status(400).json({
                error: true,
                message: 'Anno non valido'
            });
        }

        const donations = db.getDonationsByYear(year);
        res.json(donations);

    } catch (error) {
        console.error('Errore GET donations:', error);
        res.status(500).json({
            error: true,
            message: 'Errore nel recupero delle donazioni'
        });
    }
});

/**
 * GET /api/donations/:year/:month
 * Ottieni donazioni di un mese specifico
 */
router.get('/donations/:year/:month', (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const month = parseInt(req.params.month);

        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
            return res.status(400).json({
                error: true,
                message: 'Parametri non validi'
            });
        }

        const donations = db.getDonationsByMonth(year, month);
        res.json(donations);

    } catch (error) {
        console.error('Errore GET donations by month:', error);
        res.status(500).json({
            error: true,
            message: 'Errore nel recupero delle donazioni'
        });
    }
});

/**
 * POST /api/donations
 * Valida il giorno e crea la sessione Stripe — nessuna scrittura su DB (no pending)
 * La donazione viene creata nel DB solo dopo conferma pagamento via webhook
 */
router.post('/donations', async (req, res) => {
    try {
        const { day, month, year, donor_name, donor_surname, donor_cf, donor_email, is_anonymous, is_gift, gift_email, gift_recipient_name, gift_message, gift_card_design } = req.body;

        // Validazione data
        if (!day || !month || !year) {
            return res.status(400).json({ error: true, message: 'Data mancante' });
        }
        const date = new Date(year, month - 1, day);
        if (date.getDate() !== day || date.getMonth() !== month - 1) {
            return res.status(400).json({ error: true, message: 'Data non valida' });
        }

        // Verifica se già adottato
        if (db.isDayAdopted(day, month, year)) {
            return res.status(409).json({ error: true, message: 'Questo giorno e gia stato adottato!' });
        }

        const paymentMethod = req.body.payment_method || 'stripe';

        // Stripe: crea sessione con tutti i dati nel metadata (nessun record DB)
        if (paymentMethod === 'stripe' && STRIPE_ENABLED) {
            const paymentId = uuidv4();
            const sessionUrl = await createStripeCheckout({
                day, month, year,
                donor_name: is_anonymous ? null : (donor_name || null),
                donor_surname: is_anonymous ? null : (donor_surname || null),
                donor_cf: is_anonymous ? null : (donor_cf || null),
                donor_email: is_anonymous ? null : (donor_email || null),
                is_anonymous: is_anonymous || false,
                is_gift: is_gift || false,
                gift_recipient_name: gift_recipient_name || null,
                gift_card_design: gift_card_design || 'card1',
                email: gift_email || null,
                message: gift_message || null,
                payment_id: paymentId
            });
            return res.status(201).json({ stripe_url: sessionUrl, payment_method: 'stripe' });
        }

        // Satispay (invariato)
        if (paymentMethod === 'satispay' && SATISPAY_ENABLED) {
            const paymentId = uuidv4();
            const donation = db.createDonation({
                day, month, year,
                donor_name: is_anonymous ? null : donor_name,
                donor_surname: is_anonymous ? null : donor_surname,
                donor_cf: is_anonymous ? null : donor_cf,
                donor_email: is_anonymous ? null : donor_email,
                is_anonymous,
                payment_id: paymentId,
                is_gift: is_gift || false,
                gift_recipient_name: gift_recipient_name || null,
                gift_card_design: gift_card_design || 'card1',
                email: gift_email || null,
                message: gift_message || null
            });
            try {
                const satispayUrl = await createSatispayPayment(donation);
                return res.status(201).json({ id: donation.id, satispay_url: satispayUrl, payment_method: 'satispay' });
            } catch (e) {
                console.error('Errore Satispay:', e);
            }
        }

        res.status(400).json({ error: true, message: 'Metodo di pagamento non disponibile' });

    } catch (error) {
        console.error('Errore POST donation:', error);
        res.status(500).json({ error: true, message: 'Errore nella creazione della donazione' });
    }
});

/**
 * POST /api/donations/:id/confirm
 * Conferma manualmente una donazione (solo admin)
 */
router.post('/donations/:id/confirm', async (req, res) => {
    // Verifica password admin
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin2026';
    const authHeader = req.headers['authorization'] || '';
    let authorized = false;
    if (authHeader.startsWith('Basic ')) {
        const password = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
        authorized = (password === adminPassword);
    } else if (req.body && req.body.password) {
        authorized = (req.body.password === adminPassword);
    }
    if (!authorized) {
        return res.status(403).json({ error: true, message: 'Non autorizzato' });
    }

    try {
        const id = parseInt(req.params.id);

        const donation = db.getDonationById(id);
        if (!donation) {
            return res.status(404).json({
                error: true,
                message: 'Donazione non trovata'
            });
        }

        if (donation.payment_status === 'completed') {
            return res.status(400).json({
                error: true,
                message: 'Donazione gia confermata'
            });
        }

        db.confirmPayment(id);

        // Rispondi subito al client
        res.json({
            success: true,
            message: 'Donazione confermata'
        });

        // Invia notifica all'associazione in background
        sendDonationNotification(donation)
            .catch(err => console.error('Errore notifica associazione:', err));

        // Invia gift card via email in background (non blocca la risposta)
        console.log(`Donazione ${id} confermata. is_gift=${donation.is_gift}, email=${donation.email}`);
        if (donation.is_gift && donation.email) {
            console.log(`Invio gift card a ${donation.email}...`);
            sendGiftCard(donation)
                .then(() => console.log(`Gift card inviata a ${donation.email} per donazione ${id}`))
                .catch(emailError => console.error('Errore invio gift card:', emailError));
        } else {
            console.log(`Gift card NON inviata: is_gift=${donation.is_gift}, email=${donation.email}`);
        }

    } catch (error) {
        console.error('Errore confirm donation:', error);
        res.status(500).json({
            error: true,
            message: 'Errore nella conferma della donazione'
        });
    }
});

/**
 * POST /api/webhook/satispay
 * Webhook per conferma pagamento Satispay
 */
router.post('/webhook/satispay', async (req, res) => {
    try {
        console.log('Satispay webhook ricevuto:', req.body);

        const { payment_id, status } = req.body;

        // TODO: Verificare firma webhook Satispay
        // const isValid = verifySatispaySignature(req);

        if (status === 'ACCEPTED') {
            // Trova donazione con questo payment_id
            const donations = db.getDonationsByYear(2026); // Cerca nell'anno corrente
            const donation = donations.find(d => d.payment_id === payment_id);

            if (donation) {
                db.confirmPayment(donation.id);
                console.log(`Donazione ${donation.id} confermata via Satispay`);

                // Notifica all'associazione
                sendDonationNotification(donation)
                    .catch(err => console.error('Errore notifica associazione:', err));

                // Se e un regalo, invia gift card
                if (donation.is_gift && donation.email) {
                    try {
                        await sendGiftCard(donation);
                        console.log(`Gift card inviata a ${donation.email}`);
                    } catch (emailError) {
                        console.error('Errore invio gift card:', emailError);
                    }
                }
            }
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Errore webhook Satispay:', error);
        res.status(500).json({ error: true });
    }
});

/**
 * GET /api/stats
 * Ottieni statistiche generali
 */
router.get('/stats', (req, res) => {
    try {
        const year = req.query.year ? parseInt(req.query.year) : null;
        const stats = db.getStats(year);
        res.json(stats);

    } catch (error) {
        console.error('Errore GET stats:', error);
        res.status(500).json({
            error: true,
            message: 'Errore nel recupero delle statistiche'
        });
    }
});

/**
 * POST /api/webhook/stripe
 * Webhook per conferma pagamento Stripe
 */
router.post('/webhook/stripe', async (req, res) => {
    if (!STRIPE_ENABLED) {
        return res.status(400).json({ error: 'Stripe non configurato' });
    }

    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        if (endpointSecret && sig) {
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        } else {
            // Senza webhook secret (dev/test)
            event = JSON.parse(req.body.toString());
        }
    } catch (err) {
        console.error('Errore verifica webhook Stripe:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const meta = session.metadata;

        // Evita duplicati (webhook può arrivare più volte)
        const existing = db.getDonationBySessionId(session.id);
        if (existing) {
            console.log(`Webhook duplicato ignorato per sessione ${session.id}`);
            return res.json({ received: true });
        }

        const day = parseInt(meta.day);
        const month = parseInt(meta.month);
        const year = parseInt(meta.year);

        // Verifica che il giorno sia ancora libero
        if (db.isDayAdopted(day, month, year)) {
            console.warn(`Giorno ${day}/${month}/${year} già adottato al momento del webhook!`);
            return res.json({ received: true });
        }

        // Crea donazione direttamente come completed
        const donation = db.createCompletedDonation({
            day, month, year,
            donor_name: meta.donor_name || null,
            donor_surname: meta.donor_surname || null,
            donor_cf: meta.donor_cf || null,
            donor_email: meta.donor_email || null,
            is_anonymous: meta.is_anonymous === '1',
            is_gift: meta.is_gift === '1',
            gift_recipient_name: meta.gift_recipient_name || null,
            gift_card_design: meta.gift_card_design || 'card1',
            email: meta.gift_email || null,
            message: meta.gift_message || null,
            payment_id: meta.payment_id || session.id,
            stripe_session_id: session.id
        });

        console.log(`Donazione ${donation.id} creata via Stripe webhook (${day}/${month}/${year})`);

        // Email in background
        sendDonationNotification(donation)
            .catch(err => console.error('Errore notifica associazione:', err));

        if (donation.is_gift && donation.email) {
            sendGiftCard(donation)
                .then(() => console.log(`Gift card inviata a ${donation.email}`))
                .catch(err => console.error('Errore invio gift card:', err));
        }
    }

    res.json({ received: true });
});

/**
 * POST /api/send-gift/:paymentId
 * Invia la gift card per email al destinatario (chiamato dalla pagina gift-card view)
 */
router.post('/send-gift/:paymentId', async (req, res) => {
    try {
        const donation = db.getDonationByPaymentId(req.params.paymentId);
        if (!donation || donation.payment_status !== 'completed' || !donation.is_gift) {
            return res.status(404).json({ error: true, message: 'Gift card non trovata' });
        }
        if (!donation.email) {
            return res.status(400).json({ error: true, message: 'Email destinatario non presente' });
        }

        const { sendGiftCardToRecipient } = require('../utils/mailer');
        await sendGiftCardToRecipient(donation);

        res.json({ success: true, message: `Gift card inviata a ${donation.email}` });
    } catch (error) {
        console.error('Errore invio gift card al destinatario:', error);
        res.status(500).json({ error: true, message: error.message });
    }
});

/**
 * POST /api/admin/clear-database
 * Svuota tutte le donazioni dal database (protetto da password)
 */
router.post('/admin/clear-database', (req, res) => {
    try {
        const adminPassword = process.env.ADMIN_PASSWORD;
        const password = req.query.password || req.body.password;

        if (!adminPassword || password !== adminPassword) {
            return res.status(401).json({ error: true, message: 'Password non valida' });
        }

        const deleted = db.clearAllDonations();
        console.log(`Database svuotato: ${deleted} donazioni eliminate`);

        res.json({
            success: true,
            message: `Database svuotato: ${deleted} donazioni eliminate`
        });
    } catch (error) {
        console.error('Errore clear database:', error);
        res.status(500).json({ error: true, message: 'Errore nella pulizia del database' });
    }
});

/**
 * Crea sessione Stripe Checkout
 * @param {Object} donation - Dati donazione
 * @returns {String} URL per il checkout Stripe
 */
async function createStripeCheckout(donation) {
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
            price_data: {
                currency: 'eur',
                product_data: {
                    name: `Adotta il ${donation.day}/${donation.month}/${donation.year}`,
                    description: 'Donazione Calendario Solidale - Casa Famiglia Uganda',
                },
                unit_amount: 5000, // 50,00 €
            },
            quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.BASE_URL}/`,
        metadata: {
            payment_id: donation.payment_id || '',
            day: donation.day.toString(),
            month: donation.month.toString(),
            year: donation.year.toString(),
            donor_name: donation.donor_name || '',
            donor_surname: donation.donor_surname || '',
            donor_cf: donation.donor_cf || '',
            donor_email: donation.donor_email || '',
            is_anonymous: donation.is_anonymous ? '1' : '0',
            is_gift: donation.is_gift ? '1' : '0',
            gift_recipient_name: donation.gift_recipient_name || '',
            gift_email: donation.email || '',
            gift_message: (donation.message || '').substring(0, 490),
            gift_card_design: donation.gift_card_design || 'card1',
        },
    });

    return session.url;
}

/**
 * Crea pagamento Satispay
 * @param {Object} donation - Dati donazione
 * @returns {String} URL per il pagamento
 */
async function createSatispayPayment(donation) {
    const response = await fetch(`${SATISPAY_API_URL}/g_business/v1/payments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SATISPAY_API_KEY}`
        },
        body: JSON.stringify({
            flow: 'MATCH_CODE',
            amount_unit: donation.amount * 100, // Centesimi
            currency: 'EUR',
            external_code: donation.payment_id,
            callback_url: `${process.env.BASE_URL}/api/webhook/satispay`,
            metadata: {
                donation_id: donation.id,
                day: donation.day,
                month: donation.month,
                year: donation.year
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Satispay API error: ${response.status}`);
    }

    const data = await response.json();
    return data.redirect_url;
}

module.exports = router;
