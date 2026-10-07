/**
 * giftCardScheduler.js - Cron job per l'invio delle gift card il giorno adottato
 *
 * Ogni giorno alle 08:00 invia le gift card del giorno (regali e donazioni personali).
 * Alle 08:30 riprova gli invii falliti di recente e segnala i promemoria mancati.
 */

const cron = require('node-cron');
const db = require('../database/db');
const {
    sendScheduledGiftCard,
    sendPersonalReminder,
    sendDonorGiftCard,
    sendAssociationReport
} = require('../utils/mailer');

// Tipi di invio e funzione che li esegue
const SENDERS = {
    'Gift card schedulata': sendScheduledGiftCard,
    'Gift card del giorno adottato': sendPersonalReminder,
    'Conferma donante': sendDonorGiftCard
};
// Promemoria del giorno: si riprova solo nello stesso giorno dell'adozione
const SAME_DAY_TYPES = ['Gift card schedulata', 'Gift card del giorno adottato'];

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

async function retryFailures() {
    const today = db.getRomeDate();
    const failures = db.getRetryableFailures(Object.keys(SENDERS), 3);
    let retried = 0;

    for (const failure of failures) {
        const donation = db.getDonationById(failure.donation_id);
        if (!donation) continue;

        const isSameDay = donation.day === today.day && donation.month === today.month && donation.year === today.year;
        if (SAME_DAY_TYPES.includes(failure.tipo)) {
            if (!isSameDay || donation.gift_card_scheduled_sent_at) continue;
        }

        try {
            await SENDERS[failure.tipo](donation);
            if (SAME_DAY_TYPES.includes(failure.tipo)) db.markGiftCardScheduledSent(donation.id);
            retried++;
            console.log(`[GiftCardScheduler] Reinvio riuscito: ${failure.tipo} per donazione #${donation.id}`);
        } catch (error) {
            console.error(`[GiftCardScheduler] Reinvio fallito: ${failure.tipo} per donazione #${donation.id}:`, error.message);
        }
    }
    return { found: failures.length, retried };
}

async function reportMissedReminders() {
    const missed = db.getMissedReminders(3).filter(d => !d.gift_card_scheduled_sent_at);
    if (missed.length === 0) return;

    const rows = missed.map(d => `<tr><td>#${d.id}</td><td>${d.day}/${d.month}/${d.year}</td><td>${d.is_gift ? 'Regalo' : 'Personale'}</td><td>${d.is_gift ? d.gift_recipient_name : d.donor_email}</td></tr>`).join('');
    const html = `<p>Promemoria non risultati inviati negli ultimi 3 giorni. Verificare dal pannello admin:</p>
<table border="1" cellpadding="6" cellspacing="0"><tr><th>Donazione</th><th>Data</th><th>Tipo</th><th>Destinatario</th></tr>${rows}</table>`;
    try {
        await sendAssociationReport(`⚠️ Promemoria mancati: ${missed.length} da verificare`, html);
        console.log(`[GiftCardScheduler] Segnalati ${missed.length} promemoria mancati`);
    } catch (error) {
        console.error('[GiftCardScheduler] Errore invio rapporto promemoria mancati:', error.message);
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

    // Ogni giorno alle 08:30: reinvii falliti e segnalazione dei promemoria mancati
    cron.schedule('30 8 * * *', async () => {
        const { found, retried } = await retryFailures();
        if (found > 0) console.log(`[GiftCardScheduler] Invii falliti di recente: ${found}, reinviati con successo: ${retried}`);
        await reportMissedReminders();
    }, {
        timezone: 'Europe/Rome'
    });

    console.log('[GiftCardScheduler] Scheduler avviato — invio alle 08:00, controllo recupero alle 08:30 (Europe/Rome)');
}

module.exports = { startGiftCardScheduler };
