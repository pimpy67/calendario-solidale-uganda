/**
 * API Routes - Endpoints per gestire le donazioni
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { sendGiftCard, sendDonationNotification, sendDonorGiftCard, sendNataleDonorConfirmation, sendNatalePaymentRequest, nataleWhatsappText } = require('../utils/mailer');
const { codiceFiscaleValido } = require('../utils/codiceFiscale');
const { deliverNataleCardIfDue } = require('../jobs/natale');

// Gift card di Natale: prezzo e design ammessi decisi dal server, non dal browser
const NATALE_PRICE_CENTS = 2000; // 20,00 €
// Apertura della gift card: 24 dicembre 2026 alle 00:00 di Roma (UTC+1)
const NATALE_DELIVERY_AT = process.env.NATALE_DELIVERY_AT || '2026-12-23T23:00:00.000Z';
// Email al destinatario: 25 dicembre 2026 alle 00:00 di Roma (UTC+1)
const NATALE_EMAIL_AT = process.env.NATALE_EMAIL_AT || '2026-12-24T23:00:00.000Z';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Promesse del mercatino (link "paga dopo" e bonifico): scadenza del pagamento, 20 dicembre 2026 alle 23:59 di Roma
const NATALE_PAGAMENTO_SCADENZA = process.env.NATALE_PAGAMENTO_SCADENZA || '2026-12-20T22:59:59.000Z';
// Bonifico: IBAN di Effatà (pubblico, sta anche sul sito). BONIFICO_IBAN sul server lo sostituisce;
// BONIFICO_IBAN=off nasconde il bonifico nel mercatino.
const BONIFICO_IBAN_EFFATA = 'IT46W0200861720000106797497';
const BONIFICO_IBAN = (process.env.BONIFICO_IBAN === 'off' ? '' : (process.env.BONIFICO_IBAN || BONIFICO_IBAN_EFFATA))
    .replace(/\s/g, '').toUpperCase();
const BONIFICO_INTESTATARIO = process.env.BONIFICO_INTESTATARIO || 'Effatà Italia Charity Organisation ODV';

function scadenzaLeggibile() {
    return new Date(NATALE_PAGAMENTO_SCADENZA).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long' });
}
// Codice del regalo per la causale del bonifico e per ritrovarlo: NATALE-0042
function codiceRegalo(id) {
    return `NATALE-${String(id).padStart(4, '0')}`;
}
/**
 * Codice fiscale facoltativo: se c'è deve essere giusto (carattere di controllo compreso).
 * Ritorna { cf } pulito, oppure { error }.
 */
function checkCodiceFiscale(raw) {
    const cf = (raw || '').toString().replace(/\s/g, '').toUpperCase();
    if (!cf) return { cf: null };
    if (!codiceFiscaleValido(cf)) return { error: 'Codice fiscale non valido: controlla lettere e numeri' };
    return { cf };
}

/**
 * Telefono in formato internazionale, solo cifre (es. 393331234567).
 * Ritorna '' se manca, null se non valido. Senza prefisso si aggiunge il 39: i cellulari sono italiani.
 */
function normalizePhone(raw) {
    const text = (raw || '').toString().trim();
    const hasPrefix = /^(\+|00)/.test(text);
    const digits = text.replace(/[\s().-]/g, '').replace(/^(\+|00)/, '');
    if (!digits) return '';
    const full = !hasPrefix && !digits.startsWith('39') ? `39${digits}` : digits;
    if (!/^\d{8,15}$/.test(full)) return null;
    return full;
}

/**
 * Contatti e canali di invio della gift card di Natale, più il consenso privacy.
 * Chi regala sceglie email, WhatsApp o entrambi: il canale scelto deve avere il suo contatto.
 * Ritorna { error } oppure { data } con i campi da salvare.
 */
function checkNataleContacts(body) {
    const email = (body.recipient_email || '').toString().trim();
    const phone = normalizePhone(body.recipient_phone);
    const sendEmail = body.send_email === true;
    const sendWhatsapp = body.send_whatsapp === true;

    if (email && !EMAIL_RE.test(email)) return { error: 'Email di chi riceve non valida' };
    if (phone === null) return { error: 'Numero di telefono di chi riceve non valido' };
    if (sendEmail && !email) return { error: "Per l'invio via email serve l'email di chi riceve" };
    if (sendWhatsapp && !phone) return { error: "Per l'invio via WhatsApp serve il telefono di chi riceve" };
    if (!sendEmail && !sendWhatsapp) return { error: 'Scegli almeno un canale di invio: email o WhatsApp' };
    if (body.privacy_consent !== true) return { error: "Serve l'accettazione dell'informativa privacy" };

    return {
        data: {
            recipient_email: email,
            recipient_phone: phone,
            send_email: sendEmail ? 1 : 0,
            send_whatsapp: sendWhatsapp ? 1 : 0,
            privacy_consent_at: new Date().toISOString()
        }
    };
}
const { isNataleDesign, designImageUrl, normalizeCanale } = require('../utils/avvento');

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

        // Satispay via Stripe
        if (paymentMethod === 'satispay' && STRIPE_ENABLED) {
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
            }, ['satispay']);
            return res.status(201).json({ stripe_url: sessionUrl, payment_method: 'satispay' });
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
        if (donation.is_gift && !donation.is_anonymous) {
            console.log(`Invio gift card a ${donation.email}...`);
            sendGiftCard(donation)
                .then(() => console.log(`Gift card inviata a ${donation.email} per donazione ${id}`))
                .catch(emailError => console.error('Errore invio gift card:', emailError));
        } else if (!donation.is_gift && !donation.is_anonymous && donation.donor_email) {
            console.log(`Invio conferma gift card a ${donation.donor_email}...`);
            sendDonorGiftCard(donation)
                .then(() => console.log(`Conferma gift card inviata a ${donation.donor_email} per donazione ${id}`))
                .catch(emailError => console.error('Errore invio conferma donante:', emailError));
        } else {
            console.log(`Gift card NON inviata: is_gift=${donation.is_gift}, is_anonymous=${donation.is_anonymous}, donor_email=${donation.donor_email}`);
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
            const donation = db.getDonationByPaymentId(payment_id);

            // Ignora webhook duplicati: Satispay può inviare la stessa notifica più volte
            if (donation && donation.payment_status !== 'completed') {
                db.confirmPayment(donation.id);
                console.log(`Donazione ${donation.id} confermata via Satispay`);

                // Notifica all'associazione
                sendDonationNotification(donation)
                    .catch(err => console.error('Errore notifica associazione:', err));

                // Invia gift card al destinatario (regalo) o conferma al donante (donazione normale)
                if (donation.is_gift && !donation.is_anonymous) {
                    try {
                        await sendGiftCard(donation);
                        console.log(`Gift card inviata a ${donation.email}`);
                    } catch (emailError) {
                        console.error('Errore invio gift card:', emailError);
                    }
                } else if (!donation.is_gift && !donation.is_anonymous && donation.donor_email) {
                    try {
                        await sendDonorGiftCard(donation);
                        console.log(`Conferma gift card inviata a ${donation.donor_email}`);
                    } catch (emailError) {
                        console.error('Errore invio conferma donante:', emailError);
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
 * GET /api/natale/stato
 * Se la vendita delle gift card di Natale è aperta. Unico interruttore: NATALE_VENDITA_ATTIVA,
 * lo stesso che blocca il checkout, così pagina e pagamento non vanno mai fuori sincrono.
 */
router.get('/natale/stato', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ vendita_attiva: process.env.NATALE_VENDITA_ATTIVA === 'true' });
});

/**
 * GET /api/natale/count
 * Numero di gift card di Natale pagate (per il contatore della pagina)
 */
router.get('/natale/count', (req, res) => {
    res.json({ count: db.countNataleGiftCards() });
});

/**
 * Mercatino: vendita in contanti e riepilogo, protetti dal PIN unico dei volontari.
 * Il PIN sta in MERCATINO_PIN (solo sul server), anche più di uno separati da virgola.
 * Se non è impostato, il mercatino è chiuso.
 */
// Più PIN separati da virgola (es. uno per tablet): se uno gira troppo, si toglie solo quello
const MERCATINO_PINS = (process.env.MERCATINO_PIN || '').split(',').map(p => p.trim()).filter(Boolean);
function mercatinoAuthorized(req) {
    const pin = req.headers['x-mercatino-pin'];
    return typeof pin === 'string' && MERCATINO_PINS.includes(pin);
}

/**
 * GET /api/mercatino/config
 * Quali pagamenti offre il mercatino: dipende da cosa è impostato sul server.
 */
router.get('/mercatino/config', (req, res) => {
    if (!mercatinoAuthorized(req)) {
        return res.status(401).json({ error: true, message: 'PIN non valido' });
    }
    res.json({
        vendita_attiva: process.env.NATALE_VENDITA_ATTIVA === 'true',
        carta: STRIPE_ENABLED,
        link: STRIPE_ENABLED,
        bonifico: BONIFICO_IBAN !== '',
        scadenza: scadenzaLeggibile()
    });
});

/**
 * POST /api/mercatino/cash
 * Registra una gift card di Natale pagata in contanti.
 * Consegna: all'orario di consegna, come le altre.
 */
router.post('/mercatino/cash', (req, res) => {
    if (!mercatinoAuthorized(req)) {
        return res.status(401).json({ error: true, message: 'PIN non valido' });
    }
    if (process.env.NATALE_VENDITA_ATTIVA !== 'true') {
        return res.status(403).json({ error: true, message: 'Le gift card di Natale non sono ancora in vendita' });
    }
    const { donor_name, donor_email, recipient_name, message, card_design } = req.body || {};
    if (!donor_name || !recipient_name) {
        return res.status(400).json({ error: true, message: 'Compila il nome di chi regala e il nome di chi riceve' });
    }
    if (donor_email && !EMAIL_RE.test(donor_email)) {
        return res.status(400).json({ error: true, message: 'Email di chi regala non valida' });
    }
    const contacts = checkNataleContacts(req.body || {});
    if (contacts.error) {
        return res.status(400).json({ error: true, message: contacts.error });
    }
    if (!isNataleDesign(card_design)) {
        return res.status(400).json({ error: true, message: 'Disegno non valido' });
    }
    try {
        const card = db.createCashNataleGiftCard({
            payment_id: uuidv4(),
            amount: NATALE_PRICE_CENTS / 100,
            donor_name: donor_name.toString().substring(0, 100),
            donor_email: donor_email || null,
            recipient_name: recipient_name.toString().substring(0, 100),
            message: (message || '').toString().substring(0, 490) || null,
            card_design,
            donor_cf: null,
            payment_method: 'cash',
            delivery_at: NATALE_DELIVERY_AT,
            email_at: NATALE_EMAIL_AT,
            paid_at: new Date().toISOString(),
            ...contacts.data
        });
        console.log(`[Mercatino] Gift card di Natale ${card.id} registrata (${card.payment_method}, consegna ${card.delivery_at})`);
        // Conferma a chi paga in contanti, se ha lasciato l'email (stesso messaggio dei pagamenti online)
        if (card.donor_email) {
            sendNataleDonorConfirmation(card)
                .catch(err => console.error('Errore conferma gift card di Natale (contanti):', err));
        }
        res.status(201).json({ success: true, id: card.id, delivery_at: card.delivery_at });
    } catch (error) {
        console.error('Errore registrazione contanti mercatino:', error);
        res.status(500).json({ error: true, message: 'Errore nel salvataggio, riprova' });
    }
});

/**
 * GET /api/mercatino/riepilogo
 * Gift card del mercatino di oggi, con i totali per metodo. Niente email nel riepilogo.
 */
router.get('/mercatino/riepilogo', (req, res) => {
    if (!mercatinoAuthorized(req)) {
        return res.status(401).json({ error: true, message: 'PIN non valido' });
    }
    const cards = db.getMercatinoNataleGiftCardsToday().map(c => ({
        id: c.id,
        codice: codiceRegalo(c.id),
        donor_name: c.donor_name,
        recipient_name: c.recipient_name,
        card_design: c.card_design,
        amount: c.amount,
        metodo: c.payment_method,
        pagata: c.payment_status === 'completed',
        delivery_at: c.delivery_at,
        paid_at: c.paid_at
    }));
    const somma = (filter) => cards.filter(filter).reduce((sum, c) => sum + Number(c.amount), 0);
    res.json({
        count: cards.filter(c => c.pagata).length,
        total: somma(c => c.metodo === 'cash'),
        totali: {
            contanti: somma(c => c.metodo === 'cash'),
            online: somma(c => c.pagata && c.metodo !== 'cash'),
            in_attesa: cards.filter(c => !c.pagata).length
        },
        cards
    });
});

/**
 * GET /api/mercatino/invii
 * Lista di invio WhatsApp: una riga per gift card con il telefono. Il link apre WhatsApp
 * con il numero e il testo già compilati, chi invia preme solo "invia" su WhatsApp.
 */
router.get('/mercatino/invii', (req, res) => {
    if (!mercatinoAuthorized(req)) {
        return res.status(401).json({ error: true, message: 'PIN non valido' });
    }
    const cards = db.getNataleWhatsappList().map(card => ({
        id: card.id,
        recipient_name: card.recipient_name,
        recipient_phone: card.recipient_phone,
        donor_name: card.donor_name,
        sent_at: card.whatsapp_sent_at,
        whatsapp_url: `https://wa.me/${card.recipient_phone}?text=${encodeURIComponent(nataleWhatsappText(card))}`
    }));
    res.json({ count: cards.length, sent: cards.filter(c => c.sent_at).length, cards });
});

/**
 * POST /api/mercatino/invii/:id/inviato
 * Segna la gift card come inviata su WhatsApp, dopo che chi invia ha premuto "invia".
 */
router.post('/mercatino/invii/:id/inviato', (req, res) => {
    if (!mercatinoAuthorized(req)) {
        return res.status(401).json({ error: true, message: 'PIN non valido' });
    }
    if (!db.markNataleWhatsappSent(Number(req.params.id))) {
        return res.status(404).json({ error: true, message: 'Gift card non trovata' });
    }
    res.json({ success: true });
});

/**
 * Sessione Stripe per pagare una gift card di Natale già salvata (QR del sito, QR del banchetto, link "paga dopo").
 */
async function createNataleStripeSession(card, { successUrl, cancelUrl, solo } = {}) {
    const baseUrl = process.env.NATALE_BASE_URL || process.env.BASE_URL || 'https://calendario.effataitalia.it';
    const session = await stripe.checkout.sessions.create({
        // Carta e Satispay (Satispay compare solo se è attivo nel dashboard Stripe).
        // Dal mercatino si può chiedere un solo metodo: la pagina va dritta a carta o a Satispay.
        // Senza "solo": metodi attivi nel dashboard Stripe (carta, Apple Pay, Google Pay, Link, Satispay)
        ...(solo === 'card' ? { payment_method_types: ['card'] } : solo === 'satispay' ? { payment_method_types: ['satispay'] } : {}),
        // L'email non viene precompilata: con Link Stripe la chiede direttamente a chi paga
        locale: 'it',
        line_items: [{
            price_data: {
                currency: 'eur',
                product_data: {
                    name: 'Donazione liberale - Calendario Solidale Effatà',
                    description: 'Donazione liberale a sostegno della Casa Famiglia Effatà in Uganda. In segno di ringraziamento, una gift card di Natale.',
                },
                unit_amount: NATALE_PRICE_CENTS,
            },
            quantity: 1,
        }],
        mode: 'payment',
        success_url: successUrl || `${baseUrl}/natale-avvento.html?ok=1`,
        cancel_url: cancelUrl || `${baseUrl}/natale-avvento.html?annullato=1`,
        metadata: {
            type: 'natale_gift_card',
            natale_id: String(card.id),
            payment_id: card.payment_id,
            canale: card.canale || 'diretto',
        },
    });
    db.setNataleGiftCardSession(card.id, session.id);
    return session;
}

/**
 * POST /api/mercatino/attesa
 * Promessa di pagamento dal mercatino: la gift card si salva "in attesa" e parte solo quando arriva il pagamento.
 *   metodo 'link'      chi regala riceve un link per pagare con carta o Satispay quando vuole
 *   metodo 'bonifico'  chi regala riceve IBAN e causale; in admin si segna "Bonifico ricevuto"
 * Scadenza: NATALE_PAGAMENTO_SCADENZA (20 dicembre). Dopo, il link non si apre più.
 */
router.post('/mercatino/attesa', async (req, res) => {
    if (!mercatinoAuthorized(req)) {
        return res.status(401).json({ error: true, message: 'PIN non valido' });
    }
    if (process.env.NATALE_VENDITA_ATTIVA !== 'true') {
        return res.status(403).json({ error: true, message: 'Le gift card di Natale non sono ancora in vendita' });
    }
    const body = req.body || {};
    const metodo = body.metodo;
    if (!['link', 'bonifico'].includes(metodo)) {
        return res.status(400).json({ error: true, message: 'Scegli come pagherà: link o bonifico' });
    }
    if (metodo === 'link' && !STRIPE_ENABLED) {
        return res.status(503).json({ error: true, message: 'Pagamenti con carta non disponibili al momento' });
    }
    if (metodo === 'bonifico' && !BONIFICO_IBAN) {
        return res.status(503).json({ error: true, message: "Bonifico non disponibile: manca l'IBAN sul server" });
    }
    if (new Date().toISOString() > NATALE_PAGAMENTO_SCADENZA) {
        return res.status(400).json({ error: true, message: `Le promesse di pagamento si potevano fare fino al ${scadenzaLeggibile()}` });
    }
    const { donor_name, donor_email, recipient_name, message, card_design } = body;
    if (!donor_name || !recipient_name) {
        return res.status(400).json({ error: true, message: 'Compila il nome di chi regala e il nome di chi riceve' });
    }
    if (donor_email && !EMAIL_RE.test(donor_email)) {
        return res.status(400).json({ error: true, message: 'Email di chi regala non valida' });
    }
    const contacts = checkNataleContacts(body);
    if (contacts.error) {
        return res.status(400).json({ error: true, message: contacts.error });
    }
    const cf = checkCodiceFiscale(body.donor_cf);
    if (cf.error) {
        return res.status(400).json({ error: true, message: cf.error });
    }
    if (!isNataleDesign(card_design)) {
        return res.status(400).json({ error: true, message: 'Disegno non valido' });
    }
    try {
        const paymentId = uuidv4();
        const id = db.createNataleGiftCard({
            payment_id: paymentId,
            amount: NATALE_PRICE_CENTS / 100,
            donor_name: donor_name.toString().substring(0, 100),
            donor_email: donor_email || null,
            donor_cf: cf.cf,
            recipient_name: recipient_name.toString().substring(0, 100),
            message: (message || '').toString().substring(0, 490) || null,
            card_design,
            delivery_at: NATALE_DELIVERY_AT,
            email_at: NATALE_EMAIL_AT,
            canale: 'mercatino',
            payment_method: metodo,
            ...contacts.data
        });
        const card = db.getNataleGiftCardForPayment(paymentId);
        const baseUrl = process.env.NATALE_BASE_URL || process.env.BASE_URL || 'https://calendario.effataitalia.it';
        const info = {
            metodo,
            codice: codiceRegalo(id),
            causale: `${codiceRegalo(id)} gift card Natale ${card.donor_name}`.substring(0, 140),
            scadenza: scadenzaLeggibile(),
            payUrl: metodo === 'link' ? `${baseUrl}/api/natale/paga/${paymentId}` : null,
            iban: metodo === 'bonifico' ? BONIFICO_IBAN : null,
            intestatario: metodo === 'bonifico' ? BONIFICO_INTESTATARIO : null
        };
        let emailInviata = false;
        if (card.donor_email) {
            try {
                await sendNatalePaymentRequest(card, info);
                emailInviata = true;
            } catch (err) {
                console.error(`Errore invio promessa di pagamento ${id}:`, err.message);
            }
        }
        console.log(`[Mercatino] Gift card di Natale ${id} in attesa di ${metodo} (scadenza ${info.scadenza})`);
        res.status(201).json({ success: true, id, ...info, email_inviata: emailInviata, donor_email: card.donor_email || null });
    } catch (error) {
        console.error('Errore promessa di pagamento mercatino:', error);
        res.status(500).json({ error: true, message: 'Errore nel salvataggio, riprova' });
    }
});

/**
 * GET /api/natale/paga/:paymentId
 * Link "paga dopo": apre ogni volta una pagina Stripe nuova per la gift card in attesa.
 * Già pagata: porta alla pagina di grazie. Scaduta o annullata: lo dice in chiaro.
 */
router.get('/natale/paga/:paymentId', async (req, res) => {
    const baseUrl = process.env.NATALE_BASE_URL || process.env.BASE_URL || 'https://calendario.effataitalia.it';
    const pagina = (titolo, testo) => res.status(200).send(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titolo}</title></head>
<body style="font-family: Arial, sans-serif; background: #15142e; color: #f1eff9; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 16px; text-align: center;">
<div style="max-width: 460px;"><h1 style="color: #f5d27a;">${titolo}</h1><p style="font-size: 1.1rem; line-height: 1.5;">${testo}</p>
<p><a href="${baseUrl}/natale-avvento.html" style="color: #f5d27a;">Vai al Calendario dell'Avvento</a></p></div></body></html>`);
    const card = db.getNataleGiftCardForPayment(req.params.paymentId);
    if (!card || card.payment_method !== 'link') {
        return pagina('Link non valido', 'Questo link di pagamento non esiste. Controlla di averlo copiato per intero.');
    }
    if (card.payment_status === 'completed') {
        return res.redirect(303, `${baseUrl}/natale-avvento.html?ok=1`);
    }
    if (card.payment_status !== 'pending') {
        return pagina('Regalo annullato', 'Questa gift card è stata annullata. Per informazioni scrivi a info@effataitalia.it.');
    }
    if (new Date().toISOString() > NATALE_PAGAMENTO_SCADENZA) {
        return pagina('Link scaduto', `Il pagamento si poteva fare fino al ${scadenzaLeggibile()}. Per informazioni scrivi a info@effataitalia.it.`);
    }
    if (!STRIPE_ENABLED) {
        return pagina('Pagamenti non disponibili', 'Riprova tra qualche minuto.');
    }
    try {
        const session = await createNataleStripeSession(card, { cancelUrl: `${baseUrl}/api/natale/paga/${card.payment_id}` });
        res.redirect(303, session.url);
    } catch (error) {
        console.error('Errore link paga dopo:', error);
        pagina('Errore', 'Non riusciamo ad aprire il pagamento. Riprova tra qualche minuto.');
    }
});

/**
 * GET /api/natale/pagata/:paymentId
 * Solo sì o no: il mercatino lo chiede ogni pochi secondi mentre il cliente paga con il QR.
 */
router.get('/natale/pagata/:paymentId', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const card = db.getNataleGiftCardForPayment(req.params.paymentId);
    res.json({ pagata: Boolean(card && card.payment_status === 'completed') });
});

/**
 * GET /api/natale/card/:paymentId
 * Dati per la pagina di apertura. Non espone le email e non rivela nulla prima dell'orario di consegna.
 */
router.get('/natale/card/:paymentId', (req, res) => {
    const card = db.getNataleGiftCardByPaymentId(req.params.paymentId);
    if (!card) {
        return res.status(404).json({ error: true, message: 'Gift card non trovata' });
    }
    const now = new Date().toISOString();
    if (card.delivery_at > now) {
        return res.json({ available: false, delivery_at: card.delivery_at });
    }
    res.json({
        available: true,
        recipient_name: card.recipient_name,
        donor_name: card.donor_name || 'Un amico generoso',
        message: card.message || '',
        card_design: card.card_design,
        image: designImageUrl(card.card_design)
    });
});

/**
 * POST /api/natale/checkout
 * Crea una gift card di Natale da 20 € e la sessione Stripe per pagarla.
 * Non occupa nessun giorno del calendario.
 */
router.post('/natale/checkout', async (req, res) => {
    // Vendita spenta finché non si attiva esplicitamente NATALE_VENDITA_ATTIVA=true
    if (process.env.NATALE_VENDITA_ATTIVA !== 'true') {
        return res.status(403).json({ error: true, message: 'Le gift card di Natale non sono ancora in vendita' });
    }
    if (!STRIPE_ENABLED) {
        return res.status(503).json({ error: true, message: 'Pagamenti non disponibili al momento' });
    }

    const { donor_name, donor_email, donor_cf, recipient_name, message, card_design } = req.body;
    if (!donor_name || !recipient_name) {
        return res.status(400).json({ error: true, message: 'Compila il tuo nome e il nome di chi riceve' });
    }
    if (donor_email && !EMAIL_RE.test(donor_email)) {
        return res.status(400).json({ error: true, message: 'Email di chi regala non valida' });
    }
    const contacts = checkNataleContacts(req.body);
    if (contacts.error) {
        return res.status(400).json({ error: true, message: contacts.error });
    }
    // Codice fiscale facoltativo: serve solo per la ricevuta per la detrazione
    const checkedCf = checkCodiceFiscale(donor_cf);
    if (checkedCf.error) {
        return res.status(400).json({ error: true, message: checkedCf.error });
    }
    const cleanCf = checkedCf.cf;
    const design = isNataleDesign(card_design) ? card_design : 'card1';
    const cleanMessage = (message || '').toString().substring(0, 490);
    // Canale di provenienza (?da= del link con cui si è arrivati): solo per le statistiche
    const canale = normalizeCanale(req.body.canale);

    try {
        const paymentId = uuidv4();
        db.createNataleGiftCard({
            payment_id: paymentId,
            amount: NATALE_PRICE_CENTS / 100,
            donor_name: donor_name.toString().substring(0, 100),
            donor_email: donor_email || null,
            donor_cf: cleanCf || null,
            recipient_name: recipient_name.toString().substring(0, 100),
            message: cleanMessage || null,
            card_design: design,
            delivery_at: NATALE_DELIVERY_AT,
            email_at: NATALE_EMAIL_AT,
            canale,
            ...contacts.data
        });

        const card = db.getNataleGiftCardForPayment(paymentId);
        const session = await createNataleStripeSession(card, { solo: req.body.solo });
        // payment_id: il mercatino lo usa per vedere quando il pagamento con il QR è arrivato
        res.status(201).json({ stripe_url: session.url, payment_id: paymentId, id: card.id });
    } catch (error) {
        console.error('Errore checkout gift card di Natale:', error);
        res.status(500).json({ error: true, message: 'Errore nella creazione del pagamento' });
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
        if (endpointSecret) {
            // Con il segreto impostato si accettano solo eventi firmati da Stripe:
            // senza firma chiunque potrebbe fingere un pagamento completato
            if (!sig) {
                console.error('Webhook Stripe rifiutato: firma mancante');
                return res.status(400).json({ error: 'Firma mancante' });
            }
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        } else if (process.env.NODE_ENV === 'production') {
            console.error('Webhook Stripe rifiutato: STRIPE_WEBHOOK_SECRET non impostato');
            return res.status(400).json({ error: 'Webhook non configurato' });
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

        // Gift card di Natale: flusso separato, non occupa nessun giorno del calendario
        if (meta.type === 'natale_gift_card') {
            const card = db.completeNataleGiftCardBySession(session.id, meta.natale_id);
            if (card) {
                console.log(`Gift card di Natale ${card.id} pagata`);
                sendNataleDonorConfirmation(card)
                    .catch(err => console.error('Errore conferma gift card di Natale:', err));
                // Se l'orario di consegna è già passato la card parte subito, altrimenti la invia il job
                deliverNataleCardIfDue(card)
                    .catch(err => console.error('Errore invio gift card di Natale:', err));
            } else {
                console.log(`Webhook Natale duplicato ignorato per sessione ${session.id}`);
            }
            return res.json({ received: true });
        }

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

        if (donation.is_gift && !donation.is_anonymous) {
            sendGiftCard(donation)
                .then(() => console.log(`Gift card inviata a ${donation.email}`))
                .catch(err => console.error('Errore invio gift card:', err));
        } else if (!donation.is_gift && !donation.is_anonymous && donation.donor_email) {
            sendDonorGiftCard(donation)
                .then(() => console.log(`Conferma gift card inviata a ${donation.donor_email}`))
                .catch(err => console.error('Errore invio conferma donante:', err));
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
async function createStripeCheckout(donation, paymentMethodTypes = ['card', 'link']) {
    const session = await stripe.checkout.sessions.create({
        payment_method_types: paymentMethodTypes,
        line_items: [{
            price_data: {
                currency: 'eur',
                product_data: {
                    name: `Donazione liberale - Adotta il ${donation.day}/${donation.month}/${donation.year}`,
                    description: 'Donazione liberale al Calendario Solidale a sostegno della Casa Famiglia Effatà in Uganda',
                },
                unit_amount: 5000, // 50,00 €
            },
            quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.BASE_URL}/?annullato=1`,
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
