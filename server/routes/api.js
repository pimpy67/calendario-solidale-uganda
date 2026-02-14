/**
 * API Routes - Endpoints per gestire le donazioni
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { sendGiftCard } = require('../utils/mailer');

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
 * Crea una nuova donazione
 */
router.post('/donations', async (req, res) => {
    try {
        const { day, month, year, donor_name, is_anonymous, is_gift, gift_email, gift_recipient_name, gift_message, gift_card_design } = req.body;

        // Validazione
        if (!day || !month || !year) {
            return res.status(400).json({
                error: true,
                message: 'Data mancante'
            });
        }

        // Verifica data valida
        const date = new Date(year, month - 1, day);
        if (date.getDate() !== day || date.getMonth() !== month - 1) {
            return res.status(400).json({
                error: true,
                message: 'Data non valida'
            });
        }

        // Verifica se gia adottato
        if (db.isDayAdopted(day, month, year)) {
            return res.status(409).json({
                error: true,
                message: 'Questo giorno e gia stato adottato!'
            });
        }

        // Genera ID pagamento
        const paymentId = uuidv4();

        // Crea donazione
        const donation = db.createDonation({
            day,
            month,
            year,
            donor_name: is_anonymous ? null : donor_name,
            is_anonymous,
            payment_id: paymentId,
            is_gift: is_gift || false,
            gift_recipient_name: gift_recipient_name || null,
            gift_card_design: gift_card_design || 'card1',
            email: gift_email || null,
            message: gift_message || null
        });

        const paymentMethod = req.body.payment_method || 'satispay';

        // Se Satispay
        let satispayUrl = null;
        if (paymentMethod === 'satispay' && SATISPAY_ENABLED) {
            try {
                satispayUrl = await createSatispayPayment(donation);
            } catch (satispayError) {
                console.error('Errore Satispay:', satispayError);
            }
        }

        // Se Stripe - crea Checkout Session
        let stripeSessionUrl = null;
        if (paymentMethod === 'stripe' && STRIPE_ENABLED) {
            try {
                stripeSessionUrl = await createStripeCheckout(donation);
            } catch (stripeError) {
                console.error('Errore Stripe:', stripeError);
            }
        }

        res.status(201).json({
            id: donation.id,
            payment_id: paymentId,
            payment_method: paymentMethod,
            satispay_url: satispayUrl,
            stripe_url: stripeSessionUrl,
            message: 'Donazione creata con successo'
        });

    } catch (error) {
        console.error('Errore POST donation:', error);
        res.status(500).json({
            error: true,
            message: 'Errore nella creazione della donazione'
        });
    }
});

/**
 * POST /api/donations/:id/confirm
 * Conferma manualmente una donazione (per test)
 */
router.post('/donations/:id/confirm', async (req, res) => {
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

        // Se e un regalo, invia la gift card via email
        if (donation.is_gift && donation.email) {
            try {
                await sendGiftCard(donation);
                console.log(`Gift card inviata a ${donation.email} per donazione ${id}`);
            } catch (emailError) {
                console.error('Errore invio gift card:', emailError);
                // Non bloccare la conferma se l'email fallisce
            }
        }

        res.json({
            success: true,
            message: 'Donazione confermata'
        });

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
        const donationId = parseInt(session.metadata.donation_id);

        if (donationId) {
            const donation = db.getDonationById(donationId);
            if (donation && donation.payment_status !== 'completed') {
                db.confirmPayment(donationId);
                console.log(`Donazione ${donationId} confermata via Stripe`);

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
    }

    res.json({ received: true });
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
                unit_amount: donation.amount * 100, // Centesimi
            },
            quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&donation_id=${donation.id}`,
        cancel_url: `${process.env.BASE_URL}/payment-cancel?donation_id=${donation.id}`,
        metadata: {
            donation_id: donation.id.toString(),
            day: donation.day.toString(),
            month: donation.month.toString(),
            year: donation.year.toString(),
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
