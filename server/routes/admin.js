/**
 * Admin Routes - Endpoints per il pannello amministrativo
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Password admin (in produzione usare variabile ambiente)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';

/**
 * Middleware autenticazione semplice
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: true,
            message: 'Autenticazione richiesta'
        });
    }

    // Basic auth: "Basic base64(password)"
    const base64 = authHeader.split(' ')[1];
    const password = Buffer.from(base64, 'base64').toString();

    if (password !== ADMIN_PASSWORD) {
        return res.status(403).json({
            error: true,
            message: 'Password non valida'
        });
    }

    next();
}

/**
 * POST /api/admin/login
 * Verifica credenziali admin
 */
router.post('/login', (req, res) => {
    const { password } = req.body;

    if (password === ADMIN_PASSWORD) {
        res.json({
            success: true,
            message: 'Login effettuato'
        });
    } else {
        res.status(401).json({
            error: true,
            message: 'Password non valida'
        });
    }
});

/**
 * GET /api/admin/stats
 * Statistiche generali
 */
router.get('/stats', authMiddleware, (req, res) => {
    try {
        const year = req.query.year ? parseInt(req.query.year) : 2026;

        const generalStats = db.getStats(year);
        const monthlyStats = db.getStatsByMonth(year);

        // Calcola giorni rimanenti
        const daysInYear = 365; // Semplificato
        const adoptedDays = generalStats.completed_donations || 0;
        const remainingDays = daysInYear - adoptedDays;
        const percentComplete = Math.round((adoptedDays / daysInYear) * 100);

        res.json({
            year,
            total_days: daysInYear,
            adopted_days: adoptedDays,
            remaining_days: remainingDays,
            percent_complete: percentComplete,
            total_raised: generalStats.total_raised || 0,
            pending_donations: generalStats.pending_donations || 0,
            monthly_breakdown: monthlyStats
        });

    } catch (error) {
        console.error('Errore admin stats:', error);
        res.status(500).json({
            error: true,
            message: 'Errore nel recupero statistiche'
        });
    }
});

/**
 * GET /api/admin/donations
 * Lista tutte le donazioni
 */
router.get('/donations', authMiddleware, (req, res) => {
    try {
        const year = req.query.year ? parseInt(req.query.year) : 2026;
        const donations = db.getDonationsByYear(year);

        res.json(donations);

    } catch (error) {
        console.error('Errore admin donations:', error);
        res.status(500).json({
            error: true,
            message: 'Errore nel recupero donazioni'
        });
    }
});

/**
 * GET /api/admin/recent
 * Ultime donazioni
 */
router.get('/recent', authMiddleware, (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const donations = db.getRecentDonations(limit);

        res.json(donations);

    } catch (error) {
        console.error('Errore admin recent:', error);
        res.status(500).json({
            error: true,
            message: 'Errore nel recupero donazioni recenti'
        });
    }
});

/**
 * GET /api/admin/export
 * Esporta donazioni in formato CSV
 */
router.get('/export', authMiddleware, (req, res) => {
    try {
        const year = req.query.year ? parseInt(req.query.year) : null;
        const donations = db.exportDonations(year);

        // Genera CSV
        const headers = ['ID', 'Giorno', 'Mese', 'Anno', 'Donatore', 'Importo', 'Stato', 'ID Pagamento', 'Data'];
        const rows = donations.map(d => [
            d.id,
            d.day,
            d.month,
            d.year,
            d.donor_name,
            d.amount,
            d.payment_status,
            d.payment_id,
            d.created_at
        ]);

        const csv = [headers, ...rows]
            .map(row => row.map(cell => `"${cell || ''}"`).join(','))
            .join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=donazioni_${year || 'tutte'}.csv`);
        res.send(csv);

    } catch (error) {
        console.error('Errore admin export:', error);
        res.status(500).json({
            error: true,
            message: 'Errore nell\'esportazione'
        });
    }
});

/**
 * DELETE /api/admin/donations/:id
 * Cancella una donazione (solo pending)
 */
router.delete('/donations/:id', authMiddleware, (req, res) => {
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
                message: 'Non puoi cancellare una donazione completata'
            });
        }

        db.cancelPayment(id);

        res.json({
            success: true,
            message: 'Donazione cancellata'
        });

    } catch (error) {
        console.error('Errore delete donation:', error);
        res.status(500).json({
            error: true,
            message: 'Errore nella cancellazione'
        });
    }
});

/**
 * POST /api/admin/trigger-scheduler
 * Triggerare manualmente l'invio delle gift card schedulate (per test o recupero)
 */
router.post('/trigger-scheduler', authMiddleware, async (req, res) => {
    try {
        const db = require('../database/db');
        const { sendScheduledGiftCard } = require('../utils/mailer');

        const donations = db.getGiftDonationsForToday();

        if (donations.length === 0) {
            return res.json({
                success: true,
                message: 'Nessuna gift card da inviare oggi',
                sent: 0
            });
        }

        const results = [];
        for (const donation of donations) {
            try {
                await sendScheduledGiftCard(donation);
                db.markGiftCardScheduledSent(donation.id);
                results.push({ id: donation.id, status: 'inviata' });
            } catch (err) {
                results.push({ id: donation.id, status: 'errore', error: err.message });
            }
        }

        res.json({
            success: true,
            message: `Gift card inviate: ${results.filter(r => r.status === 'inviata').length}/${donations.length}`,
            results
        });

    } catch (error) {
        console.error('Errore trigger scheduler:', error);
        res.status(500).json({ error: true, message: 'Errore nel trigger scheduler' });
    }
});

module.exports = router;
