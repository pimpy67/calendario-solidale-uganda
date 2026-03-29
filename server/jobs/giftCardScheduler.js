/**
 * giftCardScheduler.js - Cron job per l'invio delle gift card il giorno adottato
 *
 * Ogni giorno alle 08:00 controlla se ci sono gift card da inviare
 * (giorno e mese coincidono con oggi, non ancora inviate).
 */

const cron = require('node-cron');
const db = require('../database/db');
const { sendScheduledGiftCard } = require('../utils/mailer');

function startGiftCardScheduler() {
    // Esegui ogni giorno alle 08:00
    cron.schedule('0 8 * * *', async () => {
        console.log('[GiftCardScheduler] Controllo gift card da inviare oggi...');

        const donations = db.getGiftDonationsForToday();

        if (donations.length === 0) {
            console.log('[GiftCardScheduler] Nessuna gift card da inviare oggi.');
            return;
        }

        console.log(`[GiftCardScheduler] Gift card da inviare: ${donations.length}`);

        for (const donation of donations) {
            try {
                await sendScheduledGiftCard(donation);
                db.markGiftCardScheduledSent(donation.id);
                console.log(`[GiftCardScheduler] Gift card inviata per donazione #${donation.id} (${donation.gift_recipient_name})`);
            } catch (error) {
                console.error(`[GiftCardScheduler] Errore invio gift card per donazione #${donation.id}:`, error.message);
            }
        }
    }, {
        timezone: 'Europe/Rome'
    });

    console.log('[GiftCardScheduler] Scheduler avviato — invio gift card ogni giorno alle 08:00 (Europe/Rome)');
}

module.exports = { startGiftCardScheduler };
