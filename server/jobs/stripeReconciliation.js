/**
 * stripeReconciliation.js - Controllo notturno dei pagamenti Stripe
 *
 * Ogni notte alle 07:00 cerca i pagamenti riusciti su Stripe negli ultimi 3 giorni
 * a cui non corrisponde nessuna donazione nel calendario (es. webhook non ricevuto)
 * e avvisa l'associazione. Non crea donazioni da solo: la decisione resta alla squadra.
 */

const cron = require('node-cron');
const db = require('../database/db');
const { sendAssociationReport } = require('../utils/mailer');

const LOOKBACK_DAYS = 3;

async function findMissingPayments() {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const since = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
    const missing = [];

    for await (const session of stripe.checkout.sessions.list({ limit: 100, created: { gte: since } })) {
        if (session.payment_status !== 'paid') continue;
        if (db.getDonationBySessionId(session.id)) continue;
        missing.push(session);
    }
    return missing;
}

async function runReconciliation() {
    if (!process.env.STRIPE_SECRET_KEY) return [];

    const missing = await findMissingPayments();
    if (missing.length === 0) {
        console.log('[Riconciliazione] Nessun pagamento Stripe senza donazione');
        return missing;
    }

    const rows = missing.map(s => {
        const m = s.metadata || {};
        const giorno = m.day && m.month ? `${m.day}/${m.month}/${m.year}` : 'non indicato';
        const importo = s.amount_total != null ? `${(s.amount_total / 100).toFixed(2)} €` : 'n.d.';
        return `<tr><td>${new Date(s.created * 1000).toLocaleDateString('it-IT')}</td><td>${giorno}</td><td>${importo}</td><td>${s.id.slice(0, 20)}…</td></tr>`;
    }).join('');
    const html = `<p>Questi pagamenti Stripe risultano pagati ma non hanno una donazione nel calendario. Possibile webhook non ricevuto: verificare e, se serve, registrare la donazione.</p>
<table border="1" cellpadding="6" cellspacing="0"><tr><th>Data</th><th>Giorno richiesto</th><th>Importo</th><th>Sessione</th></tr>${rows}</table>`;

    await sendAssociationReport(`⚠️ Pagamenti senza donazione nel calendario: ${missing.length}`, html);
    console.log(`[Riconciliazione] Segnalati ${missing.length} pagamenti senza donazione`);
    return missing;
}

function startStripeReconciliation() {
    if (!process.env.STRIPE_SECRET_KEY) {
        console.log('[Riconciliazione] Stripe non configurato: controllo non avviato');
        return;
    }
    cron.schedule('0 7 * * *', async () => {
        try {
            await runReconciliation();
        } catch (error) {
            console.error('[Riconciliazione] Errore controllo Stripe:', error.message);
        }
    }, {
        timezone: 'Europe/Rome'
    });
    console.log('[Riconciliazione] Controllo Stripe alle 07:00 (Europe/Rome)');
}

module.exports = { startStripeReconciliation, runReconciliation };
