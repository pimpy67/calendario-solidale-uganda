/**
 * retroCard.js - Retro della gift card di Natale come immagine PNG, con nome e augurio.
 * Stesso sfondo e stesse scritte del retro del sito, così la mail mostra la card uguale.
 */
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '../..');
const BG = path.join(ROOT, 'public/images/retro-sfondo.jpg');
const LOGO = path.join(ROOT, 'public/images/gift_card/logo-effata.png');
const FONT = path.join(ROOT, 'public/fonts/EBGaramond.ttf');

const W = 1748;
const H = 1240;
const BOX_W = 1000;
const PAD = 56;
const FONT_FAMILY = 'EBGaramondRetro';

let fontLoaded = false;
function ensureFont() {
    if (!fontLoaded) {
        GlobalFonts.registerFromPath(FONT, FONT_FAMILY);
        fontLoaded = true;
    }
}

// Spezza il testo in righe che stanno nella larghezza massima
function wrapLines(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
        } else {
            if (current) lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);
    return lines;
}

/**
 * Disegna il retro e ritorna il PNG come Buffer.
 * @param {{recipientName: string, message?: string|null}} data
 */
async function renderRetroPng({ recipientName, message }) {
    ensureFont();
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    const bg = await loadImage(BG);
    ctx.drawImage(bg, 0, 0, W, H);

    const logo = await loadImage(LOGO);
    const logoW = 260;
    ctx.drawImage(logo, W - logoW - 50, 40, logoW, (logo.height / logo.width) * logoW);

    // Blocchi di testo: nome, augurio facoltativo, ringraziamento, sito
    const innerW = BOX_W - 2 * PAD;
    const blocks = [];
    const add = (text, size, color, gap) => {
        ctx.font = `${size}px ${FONT_FAMILY}`;
        const lines = wrapLines(ctx, text, innerW);
        blocks.push({ lines, size, color, gap });
    };
    add(`Caro/a ${recipientName || 'amico/a'}, con questo regalo aiuti i bambini di Effatà a ricevere cibo, scuola e protezione.`, 54, '#111111', 34);
    if (message) add(`«${String(message).slice(0, 300)}»`, 46, '#8a1c1c', 34);
    add("Un Grazie e un augurio di Buon Natale dai bambini di Effatà Children's Home", 38, '#111111', 26);
    add('www.effataitalia.it', 38, '#c2185b', 0);

    // Altezza del riquadro in base al testo
    const lineHeight = (size) => Math.round(size * 1.32);
    let textH = 0;
    blocks.forEach(b => { textH += b.lines.length * lineHeight(b.size) + b.gap; });
    const boxH = textH + 2 * PAD;
    const boxX = (W - BOX_W) / 2;
    const boxY = Math.round((H - boxH) / 2);

    // Riquadro semitrasparente, angoli arrotondati
    const r = 36;
    ctx.fillStyle = 'rgba(254, 254, 243, 0.93)';
    ctx.beginPath();
    ctx.moveTo(boxX + r, boxY);
    ctx.arcTo(boxX + BOX_W, boxY, boxX + BOX_W, boxY + boxH, r);
    ctx.arcTo(boxX + BOX_W, boxY + boxH, boxX, boxY + boxH, r);
    ctx.arcTo(boxX, boxY + boxH, boxX, boxY, r);
    ctx.arcTo(boxX, boxY, boxX + BOX_W, boxY, r);
    ctx.closePath();
    ctx.fill();

    // Testo centrato nel riquadro
    let y = boxY + PAD;
    for (const b of blocks) {
        ctx.font = `${b.size}px ${FONT_FAMILY}`;
        ctx.fillStyle = b.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (const line of b.lines) {
            ctx.fillText(line, W / 2, y);
            y += lineHeight(b.size);
        }
        y += b.gap;
    }

    return canvas.encode('png');
}

module.exports = { renderRetroPng };
