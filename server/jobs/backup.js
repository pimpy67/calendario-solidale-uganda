/**
 * backup.js - Backup giornaliero del database delle donazioni
 *
 * Ogni notte alle 03:00 salva una copia in <cartella database>/backups
 * e conserva le ultime 14. Le copie vanno poi scaricate fuori dal server.
 */

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const db = require('../database/db');

const RETENTION = 14;

function getBackupDir() {
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../database/calendario.db');
    return path.join(path.dirname(dbPath), 'backups');
}

async function runBackup() {
    const dir = getBackupDir();
    fs.mkdirSync(dir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(dir, `calendario-${stamp}.db`);
    await db.backupDatabase(dest);
    console.log(`[Backup] Copia salvata: ${dest}`);

    const copies = fs.readdirSync(dir)
        .filter(f => /^calendario-.*\.db$/.test(f))
        .sort()
        .reverse();
    for (const old of copies.slice(RETENTION)) {
        fs.unlinkSync(path.join(dir, old));
        console.log(`[Backup] Rimossa copia vecchia: ${old}`);
    }
}

function startBackup() {
    cron.schedule('0 3 * * *', async () => {
        try {
            await runBackup();
        } catch (error) {
            console.error('[Backup] Errore backup:', error);
        }
    }, {
        timezone: 'Europe/Rome'
    });
    console.log('[Backup] Backup giornaliero alle 03:00 (Europe/Rome), ultime 14 copie');
}

module.exports = { startBackup, runBackup };
