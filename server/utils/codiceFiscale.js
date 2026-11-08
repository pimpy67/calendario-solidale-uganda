/**
 * codiceFiscale.js - Controllo del codice fiscale italiano (persone fisiche).
 *
 * L'ultimo carattere è un carattere di controllo calcolato dagli altri 15: se chi scrive
 * sbaglia una lettera o una cifra, il controllo quasi sempre lo scopre. Non serve la data di nascita.
 * La stessa funzione è copiata in public/js/mercatino.js, per avvisare prima di inviare.
 */

// Valori dei caratteri in posizione dispari (1ª, 3ª, … contando da 1)
const DISPARI = {
    0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
    A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
    N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23
};

function valorePari(ch) {
    return /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65;
}

/**
 * Ritorna true se il codice fiscale ha la forma giusta e il carattere di controllo torna.
 * Accetta anche i codici con omocodia (cifre sostituite da lettere).
 */
function codiceFiscaleValido(raw) {
    const cf = (raw || '').toString().trim().toUpperCase();
    if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
    let somma = 0;
    for (let i = 0; i < 15; i++) {
        somma += i % 2 === 0 ? DISPARI[cf[i]] : valorePari(cf[i]);
    }
    return String.fromCharCode(65 + (somma % 26)) === cf[15];
}

module.exports = { codiceFiscaleValido };
