/**
 * giftCardScheduler.js - Cron job per l'invio delle gift card il giorno adottato
 *
 * Ogni giorno alle 08:00 controlla se ci sono gift card da inviare
 * (giorno e mese coincidono con oggi, non ancora inviate).
 */

const cron = require('node-cron');
const db = require('../database/db');
const { sendScheduledGiftCard, sendPersonalReminder } = require('../utils/mailer');

async function sendAll(donations, sendFn) {
    for (const donation of donations) {
        try {
            await sendFn(donation);
            db.markGiftCardScheduledSent(donation.id);
            console.log(`[GiftCardScheduler] Gift card inviata per donazione #${donation.id} (${donation.gift_recipient_name || 'donazione personale'})`);
        } catch (error) {
            console.error(`[GiftCardScheduler] Errore invio gift card per donazione #${donation.id}:`, error.message);
        }
    }
}

function startGiftCardScheduler() {
    // Esegui ogni giorno alle 08:00
    cron.schedule('0 8 * * *', async () => {
        console.log('[GiftCardScheduler] Controllo gift card da inviare oggi...');

        const gifts = db.getGiftDonationsForToday();
        const personal = db.getPersonalDonationsForToday();

        if (gifts.length === 0 && personal.length === 0) {
            console.log('[GiftCardScheduler] Nessuna gift card da inviare oggi.');
            return;
        }

        console.log(`[GiftCardScheduler] Regali: ${gifts.length}, donazioni personali: ${personal.length}`);

        await sendAll(gifts, sendScheduledGiftCard);
        await sendAll(personal, sendPersonalReminder);
    }, {
        timezone: 'Europe/Rome'
    });

    console.log('[GiftCardScheduler] Scheduler avviato — invio gift card ogni giorno alle 08:00 (Europe/Rome)');
}

module.exports = { startGiftCardScheduler };
