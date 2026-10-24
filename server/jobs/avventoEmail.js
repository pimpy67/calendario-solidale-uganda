/**
 * avventoEmail.js - Email quotidiana del Calendario dell'Avvento
 *
 * Dal 1° al 25 dicembre, ogni mattina alle 07:00 (Europe/Rome), crea su Brevo una campagna con
 * l'email del giorno (server/email-avvento/AAAA-MM-GG.html) e la invia alla lista dell'Avvento.
 *
 * Variabili d'ambiente:
 *   AVVENTO_EMAIL_ATTIVA=true      unico interruttore (spento di default, come NATALE_VENDITA_ATTIVA)
 *   BREVO_API_KEY                  già usata per le gift card
 *   BREVO_AVVENTO_LIST_ID          numero della lista Brevo degli iscritti all'Avvento
 *   AVVENTO_EMAIL_MITTENTE         facoltativa: mittente verificato su Brevo; default info@effataitalia.it
 *
 * Non manda mai due volte la stessa email: prima di creare la campagna controlla su Brevo se quella
 * del giorno esiste già (dal nome). Se il server riparte dopo le 07:00, recupera l'invio entro le 12:00.
 *
 * Prova a mano (manda l'email di un giorno a un solo indirizzo, senza toccare la lista):
 *   node server/jobs/avventoEmail.js prova 2026-12-06 nome@esempio.it
 */

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const CARTELLA = path.join(__dirname, '../email-avvento');
const BREVO = 'https://api.brevo.com/v3';
const ORA_INVIO = 7;
const ORA_LIMITE_RECUPERO = 12;

function attiva() {
    return process.env.AVVENTO_EMAIL_ATTIVA === 'true';
}

/** Data (AAAA-MM-GG) e ora di adesso nel fuso del calendario */
function adessoRoma(now = new Date()) {
    const parti = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(now).map(p => [p.type, p.value]));
    return { data: `${parti.year}-${parti.month}-${parti.day}`, ora: Number(parti.hour) };
}

function emailDelGiorno(data) {
    const indice = JSON.parse(fs.readFileSync(path.join(CARTELLA, 'indice.json'), 'utf8'));
    const voce = indice.find(e => e.data === data);
    if (!voce) return null;
    return { oggetto: voce.oggetto, html: fs.readFileSync(path.join(CARTELLA, voce.file), 'utf8') };
}

function mittente() {
    // Su Brevo l'unico mittente verificato è info@effataitalia.it (dominio autenticato): un Gmail verrebbe rifiutato
    return { name: 'Effatà Italia ODV',
             email: process.env.AVVENTO_EMAIL_MITTENTE || 'info@effataitalia.it' };
}

async function brevo(metodo, percorso, corpo) {
    const res = await fetch(BREVO + percorso, {
        method: metodo,
        headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined
    });
    const testo = await res.text();
    if (!res.ok) throw new Error(`Brevo ${metodo} ${percorso}: ${res.status} ${testo}`);
    return testo ? JSON.parse(testo) : {};
}

function nomeCampagna(data) {
    return `Avvento Effatà · ${data}`;
}

/** Campagna del giorno già creata su Brevo (se c'è) */
async function campagnaEsistente(data) {
    const nome = nomeCampagna(data);
    for (let offset = 0; offset < 500; offset += 100) {
        const r = await brevo('GET', `/emailCampaigns?limit=100&offset=${offset}&sort=desc`);
        const trovata = (r.campaigns || []).find(c => c.name === nome);
        if (trovata) return trovata;
        if (!r.campaigns || r.campaigns.length < 100) return null;
    }
    return null;
}

/** Crea e invia la campagna del giorno. Ritorna una descrizione di cosa è successo. */
async function inviaEmailDelGiorno(data) {
    if (!attiva()) return 'spenta (AVVENTO_EMAIL_ATTIVA non è true)';
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_AVVENTO_LIST_ID) {
        throw new Error('Mancano BREVO_API_KEY o BREVO_AVVENTO_LIST_ID');
    }
    const email = emailDelGiorno(data);
    if (!email) return `nessuna email per il ${data}`;

    let campagna = await campagnaEsistente(data);
    if (campagna && campagna.status !== 'draft') return `già inviata (campagna ${campagna.id}, stato ${campagna.status})`;
    if (!campagna) {
        campagna = await brevo('POST', '/emailCampaigns', {
            name: nomeCampagna(data),
            subject: email.oggetto,
            sender: mittente(),
            htmlContent: email.html,
            recipients: { listIds: [Number(process.env.BREVO_AVVENTO_LIST_ID)] }
        });
    }
    await brevo('POST', `/emailCampaigns/${campagna.id}/sendNow`);
    return `inviata (campagna ${campagna.id})`;
}

async function giroDelMattino(motivo) {
    const { data } = adessoRoma();
    try {
        const esito = await inviaEmailDelGiorno(data);
        console.log(`[Avvento email] ${data} (${motivo}): ${esito}`);
    } catch (error) {
        console.error(`[Avvento email] ${data} (${motivo}) errore:`, error.message);
    }
}

function startAvventoEmail() {
    if (!attiva()) {
        console.log('[Avvento email] Spenta (AVVENTO_EMAIL_ATTIVA non è true)');
        return;
    }
    cron.schedule(`0 ${ORA_INVIO} 1-25 12 *`, () => giroDelMattino('ore 7'), { timezone: 'Europe/Rome' });
    console.log('[Avvento email] Invio alle 07:00 (Europe/Rome), dal 1° al 25 dicembre');
    // Il server è ripartito dopo le 7 di un giorno dell'Avvento: recupera l'invio (mai doppio, vedi sopra)
    const { data, ora } = adessoRoma();
    if (emailDelGiorno(data) && ora >= ORA_INVIO && ora < ORA_LIMITE_RECUPERO) giroDelMattino('recupero dopo il riavvio');
}

/** Prova: manda l'email di un giorno a un solo indirizzo, come email transazionale */
async function inviaProva(data, indirizzo) {
    const email = emailDelGiorno(data);
    if (!email) throw new Error(`Nessuna email per il ${data}`);
    await brevo('POST', '/smtp/email', {
        sender: mittente(), to: [{ email: indirizzo }], subject: `[PROVA] ${email.oggetto}`,
        htmlContent: email.html.replaceAll('{{ unsubscribe }}', '#')
    });
    return `prova del ${data} mandata a ${indirizzo}`;
}

module.exports = { startAvventoEmail, inviaEmailDelGiorno, inviaProva, adessoRoma, emailDelGiorno };

if (require.main === module) {
    require('dotenv').config();
    const [, , comando, data, indirizzo] = process.argv;
    if (comando === 'prova' && data && indirizzo) {
        inviaProva(data, indirizzo).then(console.log, e => { console.error(e.message); process.exit(1); });
    } else {
        console.log('Uso: node server/jobs/avventoEmail.js prova AAAA-MM-GG indirizzo@email');
    }
}
