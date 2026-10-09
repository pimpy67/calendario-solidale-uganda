/**
 * natale.js - Consegna programmata delle gift card di Natale
 *
 * Ogni 5 minuti cerca le gift card pagate il cui orario di consegna è passato
 * e le invia al destinatario. Chi compra dopo l'orario di consegna riceve la card
 * subito, dal webhook di Stripe (vedi deliverNataleCardIfDue).
 */

const cron = require('node-cron');
const db = require('../database/db');
const { sendNataleGiftCard } = require('../utils/mailer');

/**
 * Invia la card al destinatario, se il suo orario di consegna è già passato.
 * Ritorna true se l'invio è partito in questa chiamata.
 */
async function deliverNataleCardIfDue(card, nowIso = new Date().toISOString()) {
    if (card.delivery_at > nowIso) return false;
    if (!db.claimNataleGiftCard(card.id)) return false;

    try {
        await sendNataleGiftCard(card);
        return true;
    } catch (error) {
        db.releaseNataleGiftCard(card.id);
        console.error(`[Natale] Errore invio gift card ${card.id}, riprovo al prossimo giro:`, error.message);
        return false;
    }
}

async function deliverDueNataleCards() {
    const due = db.getDueNataleGiftCards(new Date().toISOString());
    let sent = 0;
    for (const card of due) {
        if (await deliverNataleCardIfDue(card)) sent++;
    }
    if (sent > 0) console.log(`[Natale] Gift card di Natale inviate: ${sent}`);
    return sent;
}

function startNataleDelivery() {
    cron.schedule('*/5 * * * *', async () => {
        try {
            await deliverDueNataleCards();
        } catch (error) {
            console.error('[Natale] Errore controllo consegne:', error.message);
        }
    }, {
        timezone: 'Europe/Rome'
    });
    console.log('[Natale] Consegna gift card di Natale: controllo ogni 5 minuti');
}

module.exports = {
    startNataleDelivery,
    deliverDueNataleCards,
    deliverNataleCardIfDue
};
