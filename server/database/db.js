/**
 * Database.js - Gestione SQLite per le donazioni
 */

const Database = require('better-sqlite3');
const path = require('path');

// Percorso database
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'calendario.db');

let db;

/**
 * Inizializza il database e crea le tabelle
 */
function init() {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Crea tabella donazioni
    db.exec(`
        CREATE TABLE IF NOT EXISTS donations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day INTEGER NOT NULL,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            donor_name VARCHAR(100),
            is_anonymous BOOLEAN DEFAULT 0,
            amount DECIMAL(10,2) DEFAULT 50.00,
            payment_id VARCHAR(100),
            payment_status VARCHAR(20) DEFAULT 'pending',
            email VARCHAR(255),
            phone VARCHAR(50),
            message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(day, month, year)
        )
    `);

    // Aggiungi colonne gift card (se non esistono)
    try {
        db.exec(`ALTER TABLE donations ADD COLUMN is_gift BOOLEAN DEFAULT 0`);
    } catch (e) { /* colonna gia esistente */ }
    try {
        db.exec(`ALTER TABLE donations ADD COLUMN gift_recipient_name VARCHAR(100)`);
    } catch (e) { /* colonna gia esistente */ }
    try {
        db.exec(`ALTER TABLE donations ADD COLUMN gift_card_design VARCHAR(50) DEFAULT 'card1'`);
    } catch (e) { /* colonna gia esistente */ }

    // Aggiungi colonne dati donatore (se non esistono)
    try {
        db.exec(`ALTER TABLE donations ADD COLUMN donor_surname VARCHAR(100)`);
    } catch (e) { /* colonna gia esistente */ }
    try {
        db.exec(`ALTER TABLE donations ADD COLUMN donor_cf VARCHAR(16)`);
    } catch (e) { /* colonna gia esistente */ }
    try {
        db.exec(`ALTER TABLE donations ADD COLUMN donor_email VARCHAR(255)`);
    } catch (e) { /* colonna gia esistente */ }

    // Crea indici per performance
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(year, month, day);
        CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(payment_status);
    `);

    console.log('Database inizializzato:', DB_PATH);
}

/**
 * Ottieni tutte le donazioni di un anno
 */
function getDonationsByYear(year) {
    const stmt = db.prepare(`
        SELECT * FROM donations
        WHERE year = ? AND payment_status IN ('completed', 'pending')
        ORDER BY month, day
    `);
    return stmt.all(year);
}

/**
 * Ottieni donazioni di un mese specifico
 */
function getDonationsByMonth(year, month) {
    const stmt = db.prepare(`
        SELECT * FROM donations
        WHERE year = ? AND month = ? AND payment_status IN ('completed', 'pending')
        ORDER BY day
    `);
    return stmt.all(year, month);
}

/**
 * Ottieni una singola donazione
 */
function getDonationById(id) {
    const stmt = db.prepare('SELECT * FROM donations WHERE id = ?');
    return stmt.get(id);
}

/**
 * Verifica se un giorno e gia adottato
 */
function isDayAdopted(day, month, year) {
    const stmt = db.prepare(`
        SELECT id FROM donations
        WHERE day = ? AND month = ? AND year = ?
        AND payment_status IN ('completed', 'pending')
    `);
    return stmt.get(day, month, year) !== undefined;
}

/**
 * Crea una nuova donazione
 */
function createDonation(data) {
    const stmt = db.prepare(`
        INSERT INTO donations (day, month, year, donor_name, donor_surname, donor_cf, donor_email, is_anonymous, amount, payment_id, payment_status, is_gift, gift_recipient_name, gift_card_design, email, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        data.day,
        data.month,
        data.year,
        data.donor_name,
        data.donor_surname || null,
        data.donor_cf || null,
        data.donor_email || null,
        data.is_anonymous ? 1 : 0,
        data.amount || 50.00,
        data.payment_id,
        data.is_gift ? 1 : 0,
        data.gift_recipient_name || null,
        data.gift_card_design || 'card1',
        data.email || null,
        data.message || null
    );

    return {
        id: result.lastInsertRowid,
        ...data,
        amount: data.amount || 50.00,
        payment_status: 'pending'
    };
}

/**
 * Aggiorna lo stato di un pagamento
 */
function updatePaymentStatus(id, status, paymentId = null) {
    const stmt = db.prepare(`
        UPDATE donations
        SET payment_status = ?, payment_id = COALESCE(?, payment_id), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);
    return stmt.run(status, paymentId, id);
}

/**
 * Conferma un pagamento
 */
function confirmPayment(id) {
    return updatePaymentStatus(id, 'completed');
}

/**
 * Cancella un pagamento (timeout o fallito)
 */
function cancelPayment(id) {
    return updatePaymentStatus(id, 'cancelled');
}

/**
 * Ottieni statistiche generali
 */
function getStats(year = null) {
    let query = `
        SELECT
            COUNT(*) as total_donations,
            SUM(CASE WHEN payment_status = 'completed' THEN 1 ELSE 0 END) as completed_donations,
            SUM(CASE WHEN payment_status = 'completed' THEN amount ELSE 0 END) as total_raised,
            SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) as pending_donations
        FROM donations
    `;

    if (year) {
        query += ' WHERE year = ?';
        const stmt = db.prepare(query);
        return stmt.get(year);
    }

    const stmt = db.prepare(query);
    return stmt.get();
}

/**
 * Ottieni statistiche per mese
 */
function getStatsByMonth(year) {
    const stmt = db.prepare(`
        SELECT
            month,
            COUNT(*) as total,
            SUM(CASE WHEN payment_status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN payment_status = 'completed' THEN amount ELSE 0 END) as raised
        FROM donations
        WHERE year = ?
        GROUP BY month
        ORDER BY month
    `);
    return stmt.all(year);
}

/**
 * Ottieni ultime donazioni
 */
function getRecentDonations(limit = 10) {
    const stmt = db.prepare(`
        SELECT * FROM donations
        WHERE payment_status = 'completed'
        ORDER BY updated_at DESC
        LIMIT ?
    `);
    return stmt.all(limit);
}

/**
 * Esporta tutte le donazioni (per CSV)
 */
function exportDonations(year = null) {
    let query = `
        SELECT
            id, day, month, year,
            CASE WHEN is_anonymous = 1 THEN 'Anonimo' ELSE donor_name END as donor_name,
            CASE WHEN is_anonymous = 1 THEN '' ELSE COALESCE(donor_surname, '') END as donor_surname,
            CASE WHEN is_anonymous = 1 THEN '' ELSE COALESCE(donor_cf, '') END as donor_cf,
            CASE WHEN is_anonymous = 1 THEN '' ELSE COALESCE(donor_email, '') END as donor_email,
            amount, payment_status, payment_id, created_at
        FROM donations
        WHERE payment_status = 'completed'
    `;

    if (year) {
        query += ' AND year = ?';
        query += ' ORDER BY month, day';
        const stmt = db.prepare(query);
        return stmt.all(year);
    }

    query += ' ORDER BY year, month, day';
    const stmt = db.prepare(query);
    return stmt.all();
}

/**
 * Chiudi connessione database
 */
function close() {
    if (db) {
        db.close();
    }
}

module.exports = {
    init,
    getDonationsByYear,
    getDonationsByMonth,
    getDonationById,
    isDayAdopted,
    createDonation,
    updatePaymentStatus,
    confirmPayment,
    cancelPayment,
    getStats,
    getStatsByMonth,
    getRecentDonations,
    exportDonations,
    close
};
