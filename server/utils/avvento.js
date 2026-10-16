/**
 * avvento.js - Disegni del calendario dell'Avvento usabili come gift card di Natale
 *
 * Ogni porta (1–25) ha un design "porta<giorno>", es. "porta7".
 * I contenuti stanno in public/data/avvento.json; qui si leggono solo per validare
 * la scelta e per trovare l'immagine da mettere nella card.
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '../../public');
const DATA_PATH = path.join(PUBLIC_DIR, 'data/avvento.json');
// Cartella con i disegni in piena risoluzione (fuori dal repository), per le email
const ORIGINALS_DIR = process.env.GIFT_ORIGINALS_DIR || '';

// Design delle gift card già esistenti (immagini in public/images/gift_card)
const LEGACY_DESIGNS = ['card1', 'card2', 'card3', 'card4', 'card5'];

function loadDoors() {
    try {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')).doors || [];
    } catch (e) {
        return [];
    }
}

// "porta7" = disegno davanti della finestra 7; "porta15r" = disegno del retro della finestra 15
const DESIGN_RE = /^porta(\d{1,2})(r?)$/;

function isNataleDesign(design) {
    if (LEGACY_DESIGNS.includes(design)) return true;
    const match = DESIGN_RE.exec(design || '');
    if (!match) return false;
    const door = loadDoors().find(d => d.day === Number(match[1]));
    if (!door) return false;
    return Boolean(match[2] === 'r' ? door.disegno_retro : door.disegno);
}

/**
 * URL pubblico dell'immagine del design, es. "/images/gift_card/3.webp"
 */
function designImageUrl(design) {
    const match = DESIGN_RE.exec(design || '');
    if (match) {
        const door = loadDoors().find(d => d.day === Number(match[1]));
        if (!door) return null;
        return (match[2] === 'r' ? door.disegno_retro : door.disegno) || null;
    }
    const legacy = /^card(\d)$/.exec(design || '');
    return legacy ? `/images/gift_card/${legacy[1]}.webp` : null;
}

/**
 * Percorso sul disco dell'immagine del design, per allegarla alle email
 */
function designImageFile(design) {
    const url = designImageUrl(design);
    if (!url) return null;
    // Per l'email: l'originale in piena risoluzione, se presente fuori dal sito
    if (ORIGINALS_DIR) {
        const original = path.join(ORIGINALS_DIR, path.basename(url));
        if (fs.existsSync(original)) return original;
    }
    const filePath = path.join(PUBLIC_DIR, url);
    return fs.existsSync(filePath) ? filePath : null;
}

module.exports = {
    isNataleDesign,
    designImageUrl,
    designImageFile
};
