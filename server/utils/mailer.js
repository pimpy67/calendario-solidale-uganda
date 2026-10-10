/**
 * Mailer.js - Invio email gift card e notifiche
 * Provider, in ordine di priorità:
 *   1. Brevo (API HTTP) se è impostata BREVO_API_KEY
 *   2. SMTP generico se sono impostate SMTP_HOST, SMTP_USER, SMTP_PASS (es. Hostinger)
 *   3. Gmail SMTP se sono impostate GMAIL_USER e GMAIL_APP_PASSWORD
 * Se nessun provider è configurato o manca l'indirizzo del destinatario la
 * funzione lancia un errore, così il chiamante sa che l'email non è partita.
 */

const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const { promisify } = require('util');
const resolve4 = promisify(dns.resolve4);
const db = require('../database/db');
const avvento = require('./avvento');

const MONTHS = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

const IMAGE_MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

const DEFAULT_AMOUNT = 50;

/**
 * Restituisce il provider email da usare oppure lancia un errore se non ce n'è nessuno
 */
function getProvider() {
    if (process.env.BREVO_API_KEY) return 'brevo';
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'gmail';
    throw new Error('Nessun servizio email configurato (BREVO_API_KEY, SMTP_HOST/SMTP_USER/SMTP_PASS oppure GMAIL_USER/GMAIL_APP_PASSWORD)');
}

/**
 * Indirizzo mittente per il provider scelto
 */
function getFromAddress(provider, displayName = 'Calendario Solidale - Effatà') {
    if (provider === 'brevo') {
        return `${displayName} <${process.env.GMAIL_USER || 'effataitalia@gmail.com'}>`;
    }
    if (provider === 'smtp') {
        return `"${displayName}" <${process.env.SMTP_USER}>`;
    }
    return `"${displayName}" <${process.env.GMAIL_USER}>`;
}

/**
 * Crea il transporter Nodemailer per un server SMTP generico (es. Hostinger)
 */
function createSmtpTransporter() {
    const port = Number(process.env.SMTP_PORT || 465);
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

/**
 * Crea il transporter Nodemailer con Gmail (per uso locale)
 */
async function createTransporter() {
    let host = 'smtp.gmail.com';
    try {
        const addresses = await resolve4('smtp.gmail.com');
        if (addresses && addresses.length > 0) {
            host = addresses[0];
            console.log(`SMTP Gmail risolto a IPv4: ${host}`);
        }
    } catch (e) {
        console.warn('Fallback a smtp.gmail.com (DNS resolve4 fallito)');
    }

    return nodemailer.createTransport({
        host,
        port: 465,
        secure: true,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: {
            servername: 'smtp.gmail.com'
        },
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
}

/**
 * Trova il file immagine della gift card scelta
 */
function getGiftCardImagePath(cardName) {
    // Disegni del calendario dell'Avvento (porta1..porta25)
    if (cardName.startsWith('porta')) return avvento.designImageFile(cardName);
    const giftcardsDir = path.join(__dirname, '../../public/images/gift_card');
    const cardNumber = cardName.replace('card', '');
    const extensions = Object.keys(IMAGE_MIME);

    for (const ext of extensions) {
        const filePath = path.join(giftcardsDir, cardNumber + ext);
        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }
    return null;
}

/**
 * Prepara l'immagine della gift card per il provider scelto.
 * Con Brevo viene incorporata in base64 nell'HTML, con Gmail resta un file da allegare.
 */
function loadCardImage(donation, provider) {
    const imagePath = getGiftCardImagePath(donation.gift_card_design || 'card1');
    if (!imagePath) {
        return { imagePath: null, imageBase64: null, imageMime: null };
    }
    if (provider !== 'brevo') {
        return { imagePath, imageBase64: null, imageMime: null };
    }
    return {
        imagePath,
        imageBase64: fs.readFileSync(imagePath).toString('base64'),
        imageMime: IMAGE_MIME[path.extname(imagePath).toLowerCase()] || 'image/png'
    };
}

/**
 * Importo della donazione formattato all'italiana, es. "50,00"
 */
function formatAmount(donation) {
    return Number(donation.amount || DEFAULT_AMOUNT).toFixed(2).replace('.', ',');
}

/**
 * Genera il template HTML della gift card
 */
function generateGiftCardHTML(donation, hasImage, imageBase64, imageMime) {
    const monthName = MONTHS[donation.month - 1];
    const donorName = donation.is_anonymous ? 'Un amico generoso' : (donation.donor_name || 'Un amico generoso');
    const isGift = !!donation.is_gift;
    const recipientName = isGift ? (donation.gift_recipient_name || 'Amico/a') : donorName;
    const personalMessage = donation.message || '';
    const dateStr = `${donation.day} ${monthName} ${donation.year}`;
    const amountStr = formatAmount(donation);
    const baseUrl = process.env.BASE_URL || 'https://calendario.effataitalia.it';
    const giftCardViewUrl = `${baseUrl}/gift-card/${donation.payment_id}`;

    let whatsappText, mailtoUrl, introText, shareText;
    if (isGift) {
        whatsappText = `🎉 Ciao ${recipientName}! Oggi è il tuo giorno speciale!\n${donorName} ti ha regalato il ${dateStr} del Calendario Solidale della Casa Famiglia Effatà in Uganda ❤\n\nQuesta donazione aiuta a garantire cibo, istruzione e cure ai bambini della Casa Famiglia Effatà in Uganda.\nOgni giorno adottato fa la differenza!\nGrazie di Cuore da parte dei nostri bambini\n\nEcco la tua gift card:\n${giftCardViewUrl}\n\nGRAZIE!\n\nhttps://www.effatacharityorganisation.org/`;
        mailtoUrl = donation.email ? giftCardViewUrl : null;
        introText = `Hai ricevuto un regalo speciale! <strong>${donorName}</strong> ha adottato un giorno del Calendario Solidale in tuo nome.`;
        shareText = `Manda gli auguri a <strong>${recipientName}</strong> — il messaggio è già pronto, puoi modificarlo come vuoi! 💝`;
    } else {
        whatsappText = `🎉 Ho adottato il ${dateStr} del Calendario Solidale della Casa Famiglia Effatà in Uganda ❤\n\nOgni donazione aiuta a garantire cibo, istruzione e cure ai bambini di Effatà.\nL'amore non si divide, si moltiplica! ❤\nAdotta anche tu un giorno su: ${baseUrl}\n\nGRAZIE!\nhttps://www.effatacharityorganisation.org/`;
        mailtoUrl = null;
        introText = `Grazie per il tuo gesto generoso! Hai adottato un giorno del <strong>Calendario Solidale Effatà</strong> a sostegno dei bambini della Casa Famiglia in Uganda.`;
        shareText = `Condividi la tua adozione — l'amore non si divide, si moltiplica! 💚`;
    }

    // Con Brevo l'immagine è inline in base64, con Gmail usiamo cid: (allegato)
    let imageTag = '';
    if (hasImage && imageBase64) {
        imageTag = `<img src="data:${imageMime};base64,${imageBase64}" alt="Gift Card" style="width: 100%; height: auto; border-radius: 12px; display: block;">`;
    } else if (hasImage) {
        imageTag = `<img src="cid:giftcard" alt="Gift Card" style="width: 100%; height: auto; border-radius: 12px; display: block;">`;
    }

    return `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f0eb; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f0eb; padding: 30px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">

                    <!-- Header con sfondo verde -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #2e7d32, #4caf50); padding: 40px 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">
                                Calendario Solidale
                            </h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 16px;">
                                Effat&agrave; Children's Home - Uganda
                            </p>
                        </td>
                    </tr>


                    ${hasImage ? `
                    <!-- Immagine Gift Card -->
                    <tr>
                        <td style="padding: 30px 30px 0;">
                            ${imageTag}
                        </td>
                    </tr>
                    ` : ''}

                    <!-- Gift Card Body -->
                    <tr>
                        <td style="padding: ${hasImage ? '20px' : '40px'} 30px;">

                            <!-- Saluto -->
                            <p style="color: #333; font-size: 18px; margin: 0 0 20px 0;">
                                Caro/a <strong>${recipientName}</strong>,
                            </p>

                            <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                                ${introText}
                            </p>

                            <!-- Card data adottata -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #e8f5e9, #c8e6c9); border-radius: 12px; margin-bottom: 30px;">
                                <tr>
                                    <td style="padding: 30px; text-align: center;">
                                        <p style="color: #2e7d32; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 10px 0;">
                                            Giorno adottato
                                        </p>
                                        <p style="color: #1b5e20; font-size: 32px; font-weight: 700; margin: 0 0 10px 0;">
                                            ${dateStr}
                                        </p>
                                        <p style="color: #2e7d32; font-size: 14px; margin: 0;">
                                            Donazione di ${amountStr} &euro;
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            ${personalMessage ? `
                            <!-- Messaggio personale -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                                <tr>
                                    <td style="border-left: 4px solid #4caf50; padding: 15px 20px; background-color: #fafafa; border-radius: 0 8px 8px 0;">
                                        <p style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">
                                            Messaggio personale
                                        </p>
                                        <p style="color: #333; font-size: 16px; font-style: italic; line-height: 1.5; margin: 0;">
                                            "${personalMessage}"
                                        </p>
                                        <p style="color: #666; font-size: 14px; margin: 10px 0 0 0; text-align: right;">
                                            &mdash; ${donorName}
                                        </p>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}

                            <!-- Info progetto -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff8e1; border-radius: 12px; margin-bottom: 20px;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <p style="color: #f57f17; font-size: 20px; margin: 0 0 10px 0;">&#10084;</p>
                                        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0;">
                                            Questa donazione aiuta a garantire <strong>cibo, istruzione e cure</strong> ai bambini della Casa Famiglia Effat&agrave; in Uganda. Ogni giorno adottato fa la differenza!
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Bottoni condivisione -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 10px;">
                                <tr>
                                    <td style="text-align: center;">
                                        <p style="color: #555; font-size: 14px; margin: 0 0 14px 0;">
                                            ${shareText}
                                        </p>
                                        <a href="https://wa.me/?text=${encodeURIComponent(whatsappText)}"
                                           style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 24px; border-radius: 50px; margin: 4px;">
                                            💬 ${isGift ? 'Auguri su WhatsApp' : 'Condividi su WhatsApp'}
                                        </a>
                                        ${mailtoUrl ? `
                                        <a href="${mailtoUrl}"
                                           style="display: inline-block; background-color: #1976D2; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 24px; border-radius: 50px; margin: 4px;">
                                            ✉️ Auguri via Email
                                        </a>` : ''}
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #263238; padding: 25px 30px; text-align: center;">
                            <p style="color: rgba(255,255,255,0.7); font-size: 13px; margin: 0 0 5px 0;">
                                Effat&agrave; Children's Home &bull; Calendario Solidale 2026
                            </p>
                            <p style="color: rgba(255,255,255,0.5); font-size: 12px; margin: 0;">
                                &copy; 2026 Casa Famiglia Uganda
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

/**
 * Invia email tramite Brevo (Sendinblue) API (HTTP)
 * Il mittente deve essere verificato su Brevo.
 */
async function sendViaBrevo(mailOptions, imagePath) {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
        throw new Error('BREVO_API_KEY non configurata');
    }

    // Estrai nome e indirizzo dal campo from (es: "Nome <email@example.com>")
    const fromMatch = mailOptions.from.match(/^"?([^"<]+)"?\s*<(.+)>$/);
    const fromName = fromMatch ? fromMatch[1].trim() : 'Calendario Solidale';
    const fromEmail = fromMatch ? fromMatch[2].trim() : mailOptions.from;

    const body = {
        sender: { name: fromName, email: fromEmail },
        to: [{ email: mailOptions.to }],
        subject: mailOptions.subject,
        htmlContent: mailOptions.html
    };

    // Aggiungi immagine come allegato se presente
    if (imagePath) {
        const imageBuffer = fs.readFileSync(imagePath);
        body.attachment = [{
            name: path.basename(imagePath),
            content: imageBuffer.toString('base64')
        }];
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Brevo API error ${response.status}: ${errorData}`);
    }

    return await response.json();
}

/**
 * Invia con un transporter SMTP, allegando l'immagine con cid: "giftcard"
 */
async function sendWithTransporter(transporter, mailOptions, imagePath) {
    if (imagePath) {
        mailOptions.attachments = [{
            filename: path.basename(imagePath),
            path: imagePath,
            cid: 'giftcard'
        }];
    }

    return await transporter.sendMail(mailOptions);
}

/**
 * Invia email tramite Gmail SMTP
 */
async function sendViaGmail(mailOptions, imagePath) {
    return sendWithTransporter(await createTransporter(), mailOptions, imagePath);
}

/**
 * Invia email tramite SMTP generico (es. Hostinger)
 */
async function sendViaSmtp(mailOptions, imagePath) {
    return sendWithTransporter(createSmtpTransporter(), mailOptions, imagePath);
}

/**
 * Invia con il provider scelto
 */
function sendEmail(provider, mailOptions, imagePath) {
    if (provider === 'brevo') return sendViaBrevo(mailOptions, imagePath);
    if (provider === 'smtp') return sendViaSmtp(mailOptions, imagePath);
    return sendViaGmail(mailOptions, imagePath);
}

/**
 * Registra l'esito di un invio nel database. Non lancia errori.
 */
function logSend(donation, tipo, to, esito, error) {
    try {
        db.logEmail({
            donation_id: donation && donation.id,
            tipo,
            destinatario: to,
            esito,
            errore: error ? String(error.message || error) : null
        });
    } catch (e) {
        console.error('Errore registrazione email:', e.message);
    }
}

/**
 * Avvisa l'associazione che un invio è fallito. Non lancia errori.
 * Usa sendEmail direttamente, senza tracciamento, per non creare cicli.
 */
async function alertFailure(donation, tipo, to, error) {
    const notifyEmail = process.env.ASSOCIATION_EMAIL || process.env.GMAIL_USER;
    if (!notifyEmail) return;
    try {
        const provider = getProvider();
        const html = `<p><strong>Invio email fallito</strong></p>
<p>Tipo: ${tipo}<br>Donazione: #${donation && donation.id}<br>Destinatario: ${to || 'non indicato'}</p>
<p>Errore: ${String((error && error.message) || error)}</p>
<p>Controlla il pannello admin o il registro email per riprovare.</p>`;
        await sendEmail(provider, {
            from: getFromAddress(provider, 'Calendario Solidale'),
            to: notifyEmail,
            subject: `⚠️ Invio email fallito: ${tipo} (donazione #${donation && donation.id})`,
            html
        }, null);
    } catch (e) {
        console.error('Errore invio avviso fallimento:', e.message);
    }
}

/**
 * Esegue un invio registrando l'esito; in caso di errore avvisa e rilancia.
 */
async function trackedSend(donation, tipo, to, fn) {
    try {
        const result = await fn();
        logSend(donation, tipo, to, 'ok');
        return result;
    } catch (error) {
        logSend(donation, tipo, to, 'errore', error);
        await alertFailure(donation, tipo, to, error);
        throw error;
    }
}

/**
 * Costruisce e invia una gift card a un indirizzo.
 * Ritorna il risultato del provider; lancia un errore se non può inviare.
 */
async function deliverGiftCard(args) {
    return trackedSend(args.donation, args.label, args.to, () => sendGiftCardEmail(args));
}

async function sendGiftCardEmail({ donation, to, subject, label }) {
    const provider = getProvider();
    if (!to) {
        throw new Error(`Email destinatario mancante per donazione ${donation.id}`);
    }

    const { imagePath, imageBase64, imageMime } = loadCardImage(donation, provider);
    const mailOptions = {
        from: getFromAddress(provider),
        to,
        subject,
        html: generateGiftCardHTML(donation, !!imagePath, imageBase64, imageMime)
    };

    const result = await sendEmail(provider, mailOptions, imagePath);
    console.log(`${label} inviata via ${provider} a ${to} per donazione ${donation.id}`);
    return result;
}

/**
 * Avvisa l'associazione che una gift card è stata inviata con successo.
 * Non lancia errori: la gift card è già partita, la notifica è solo informativa.
 * @param {Object} donation - Dati della donazione dal database
 * @param {string} kind - Tipo di invio, es. "Gift card schedulata inviata"
 * @param {string} to - Indirizzo a cui è stata inviata la gift card
 */
async function notifyAssociationSent(donation, kind, to) {
    const notifyEmail = process.env.ASSOCIATION_EMAIL || process.env.GMAIL_USER;
    if (!notifyEmail) return;

    try {
        const provider = getProvider();
        const dateStr = `${donation.day} ${MONTHS[donation.month - 1]} ${donation.year}`;
        const donorName = donation.is_anonymous ? 'Anonimo' : (donation.donor_name || 'N/D');
        const html = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; font-family: 'Segoe UI', Tahoma, sans-serif; background-color:#f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px 0;">
        <tr><td align="center">
            <table width="550" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.1);">
                <tr>
                    <td style="background:linear-gradient(135deg,#2e7d32,#4caf50); padding:25px; text-align:center;">
                        <h2 style="color:#fff; margin:0; font-size:22px;">${kind}</h2>
                    </td>
                </tr>
                <tr>
                    <td style="padding:30px;">
                        <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px; width:140px;">Giorno adottato</td>
                                <td style="color:#333; font-size:15px; font-weight:600;">${dateStr}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Inviata a</td>
                                <td style="color:#333; font-size:15px;">${to}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Destinatario</td>
                                <td style="color:#333; font-size:15px;">${donation.gift_recipient_name || 'N/D'}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Donatore</td>
                                <td style="color:#333; font-size:15px;">${donorName}</td>
                            </tr>
                        </table>
                        <p style="color:#999; font-size:12px; margin-top:20px; text-align:center;">
                            Donazione #${donation.id} &bull; Gift card inviata
                        </p>
                    </td>
                </tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;

        await sendEmail(provider, {
            from: getFromAddress(provider, 'Calendario Solidale'),
            to: notifyEmail,
            subject: `✅ ${kind} — donazione #${donation.id}`,
            html
        }, null);
        console.log(`Notifica invio gift card #${donation.id} inviata a ${notifyEmail}`);
    } catch (error) {
        console.error('Errore notifica invio gift card:', error);
    }
}

/**
 * Invia la gift card via email in anteprima al DONANTE (che decide come consegnarla al destinatario)
 * @param {Object} donation - Dati della donazione dal database
 */
function sendGiftCard(donation) {
    return deliverGiftCard({
        donation,
        to: donation.donor_email || donation.email,
        subject: `🎁 Hai adottato il ${donation.day} ${MONTHS[donation.month - 1]} per ${donation.gift_recipient_name || 'qualcuno'}! Ecco la tua gift card`,
        label: 'Gift card'
    });
}

/**
 * Invia la gift card schedulata il giorno del compleanno al DONANTE, con bottone WhatsApp
 * @param {Object} donation - Dati della donazione dal database
 */
async function sendScheduledGiftCard(donation) {
    const to = donation.donor_email || donation.email;
    const result = await deliverGiftCard({
        donation,
        to,
        subject: `🎉 Oggi è il compleanno di ${donation.gift_recipient_name || 'qualcuno'}! Manda gli auguri 💬`,
        label: 'Gift card schedulata'
    });
    await notifyAssociationSent(donation, 'Gift card schedulata inviata', to);
    return result;
}

/**
 * Invia al DONANTE, il giorno adottato, la gift card della donazione personale (non regalo)
 * @param {Object} donation - Dati della donazione dal database
 */
async function sendPersonalReminder(donation) {
    const to = donation.donor_email;
    const dateStr = `${donation.day} ${MONTHS[donation.month - 1]}`;
    const result = await deliverGiftCard({
        donation,
        to,
        subject: `🎉 Oggi è il giorno che hai adottato (${dateStr})! Ecco la tua gift card`,
        label: 'Gift card del giorno adottato'
    });
    await notifyAssociationSent(donation, 'Gift card del giorno adottato inviata', to);
    return result;
}

/**
 * Invia la gift card per email direttamente al destinatario del regalo
 * (chiamato dalla pagina gift-card view quando il donante clicca "Invia per Email")
 */
async function sendGiftCardToRecipient(donation) {
    const recipientName = donation.gift_recipient_name || 'Amico/a';
    const result = await deliverGiftCard({
        donation,
        to: donation.email,
        subject: `🎁 Hai ricevuto un regalo speciale per il tuo compleanno, ${recipientName}!`,
        label: 'Gift card destinatario'
    });
    await notifyAssociationSent(donation, 'Gift card inviata al destinatario', donation.email);
    return result;
}

/**
 * Invia notifica di avvenuta donazione all'associazione.
 * Lancia un errore se manca la configurazione; gli errori di invio vengono loggati.
 * I chiamanti hanno un .catch: la donazione è già confermata e non va annullata.
 * @param {Object} donation - Dati della donazione dal database
 */
async function sendDonationNotification(donation) {
    const notifyEmail = process.env.ASSOCIATION_EMAIL || process.env.GMAIL_USER;
    if (!notifyEmail) {
        throw new Error('Nessuna email associazione configurata (ASSOCIATION_EMAIL o GMAIL_USER)');
    }

    const provider = getProvider();

    const monthName = MONTHS[donation.month - 1];
    const dateStr = `${donation.day} ${monthName} ${donation.year}`;
    const donorName = donation.is_anonymous ? 'Anonimo' : (donation.donor_name || 'N/D');
    const donorSurname = donation.donor_surname || '';
    const donorCF = donation.donor_cf || 'Non fornito';
    const donorEmail = donation.donor_email || 'Non fornita';
    const amount = Number(donation.amount || DEFAULT_AMOUNT);

    const html = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; font-family: 'Segoe UI', Tahoma, sans-serif; background-color:#f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px 0;">
        <tr><td align="center">
            <table width="550" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.1);">
                <tr>
                    <td style="background:linear-gradient(135deg,#2e7d32,#4caf50); padding:25px; text-align:center;">
                        <h2 style="color:#fff; margin:0; font-size:22px;">Nuova Donazione Ricevuta</h2>
                    </td>
                </tr>
                <tr>
                    <td style="padding:30px;">
                        <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px; width:140px;">Giorno adottato</td>
                                <td style="color:#333; font-size:15px; font-weight:600;">${dateStr}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Importo</td>
                                <td style="color:#2e7d32; font-size:15px; font-weight:600;">${amount.toFixed(2)} &euro;</td>
                            </tr>
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Nome</td>
                                <td style="color:#333; font-size:15px;">${donorName}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Cognome</td>
                                <td style="color:#333; font-size:15px;">${donorSurname || 'N/D'}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Codice Fiscale</td>
                                <td style="color:#333; font-size:15px; font-family:monospace;">${donorCF}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Email</td>
                                <td style="color:#333; font-size:15px;">${donorEmail}</td>
                            </tr>
                            ${donation.is_gift ? `
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Regalo per</td>
                                <td style="color:#333; font-size:15px;">${donation.gift_recipient_name || 'N/D'} (${donation.email || 'no email'})</td>
                            </tr>` : ''}
                        </table>
                        <p style="color:#999; font-size:12px; margin-top:20px; text-align:center;">
                            Donazione #${donation.id} &bull; Pagamento confermato
                        </p>
                    </td>
                </tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;

    const mailOptions = {
        from: getFromAddress(provider, 'Calendario Solidale'),
        to: notifyEmail,
        subject: `Donazione confermata: ${donorName} ${donorSurname} - ${dateStr} (${amount.toFixed(2)}€)`,
        html
    };

    try {
        await trackedSend(donation, 'Notifica associazione', notifyEmail, () => sendEmail(provider, mailOptions, null));
        console.log(`Notifica donazione #${donation.id} inviata a ${notifyEmail}`);
    } catch (error) {
        console.error('Errore invio notifica associazione:', error);
    }
}

/**
 * Invia email di conferma donazione al donante (non regalo, non anonima)
 * con la gift card allegata come immagine
 * @param {Object} donation - Dati della donazione dal database
 */
async function sendDonorGiftCard(donation) {
    const provider = getProvider();

    const donorEmail = donation.donor_email;
    if (!donorEmail) {
        throw new Error(`Email donante mancante per donazione ${donation.id}`);
    }

    const monthName = MONTHS[donation.month - 1];
    const dateStr = `${donation.day} ${monthName} ${donation.year}`;
    const donorName = donation.donor_name || 'Donatore';
    const donorSurname = donation.donor_surname || '';
    const donorCF = donation.donor_cf || 'Non fornito';
    const amount = Number(donation.amount || DEFAULT_AMOUNT);

    // Gift card come allegato (immagine)
    const imagePath = getGiftCardImagePath(donation.gift_card_design || 'card1');

    const html = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; font-family: 'Segoe UI', Tahoma, sans-serif; background-color:#f5f0eb;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 30px 0;">
        <tr><td align="center">
            <table width="550" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.1);">
                <tr>
                    <td style="background:linear-gradient(135deg,#2e7d32,#4caf50); padding:35px 30px; text-align:center;">
                        <h1 style="color:#fff; margin:0 0 8px 0; font-size:26px; font-weight:700;">Calendario Solidale</h1>
                        <p style="color:rgba(255,255,255,0.9); margin:0; font-size:15px;">Effat&agrave; Children's Home - Uganda</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding:30px;">
                        <p style="color:#333; font-size:18px; margin:0 0 20px 0;">
                            Caro/a <strong>${donorName}</strong>,
                        </p>
                        <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 25px 0;">
                            Grazie di cuore! La tua donazione è stata confermata con successo.<br>
                            Trovi in allegato la tua <strong>gift card</strong> del Calendario Solidale Effatà.
                        </p>

                        <!-- Riepilogo donazione -->
                        <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse; margin-bottom:25px;">
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px; width:140px;">Giorno adottato</td>
                                <td style="color:#1b5e20; font-size:16px; font-weight:700;">${dateStr}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Importo</td>
                                <td style="color:#2e7d32; font-size:15px; font-weight:600;">${amount.toFixed(2)} &euro;</td>
                            </tr>
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Nome</td>
                                <td style="color:#333; font-size:15px;">${donorName} ${donorSurname}</td>
                            </tr>
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="color:#888; font-size:13px;">Codice Fiscale</td>
                                <td style="color:#333; font-size:15px; font-family:monospace;">${donorCF}</td>
                            </tr>
                        </table>

                        <!-- Box cuore -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff8e1; border-radius:12px; margin-bottom:20px;">
                            <tr>
                                <td style="padding:20px; text-align:center;">
                                    <p style="color:#f57f17; font-size:22px; margin:0 0 8px 0;">&#10084;</p>
                                    <p style="color:#555; font-size:14px; line-height:1.6; margin:0;">
                                        Questa donazione aiuta a garantire <strong>cibo, istruzione e cure</strong><br>
                                        ai bambini della Casa Famiglia Effat&agrave; in Uganda.<br>
                                        <em>L'amore non si divide, si moltiplica!</em>
                                    </p>
                                </td>
                            </tr>
                        </table>

                        <p style="color:#999; font-size:12px; margin:0; text-align:center;">
                            Donazione #${donation.id} &bull; Pagamento confermato
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="background-color:#263238; padding:20px 30px; text-align:center;">
                        <p style="color:rgba(255,255,255,0.7); font-size:13px; margin:0 0 4px 0;">
                            Effat&agrave; Children's Home &bull; Calendario Solidale 2026
                        </p>
                        <p style="color:rgba(255,255,255,0.5); font-size:12px; margin:0;">
                            &copy; 2026 Casa Famiglia Uganda
                        </p>
                    </td>
                </tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;

    const mailOptions = {
        from: getFromAddress(provider),
        to: donorEmail,
        subject: `🎉 Grazie ${donorName}! Hai adottato il ${dateStr} — ecco la tua gift card`,
        html
    };

    try {
        await trackedSend(donation, 'Conferma donante', donorEmail, () => sendEmail(provider, mailOptions, imagePath));
        console.log(`Conferma + gift card inviata via ${provider} a ${donorEmail} per donazione ${donation.id}`);
    } catch (error) {
        console.error('Errore invio conferma donante:', error);
        throw error;
    }
}

/**
 * Invia un rapporto operativo (es. promemoria mancati) all'associazione
 */
async function sendAssociationReport(subject, html) {
    const notifyEmail = process.env.ASSOCIATION_EMAIL || process.env.GMAIL_USER;
    if (!notifyEmail) return;
    const provider = getProvider();
    await sendEmail(provider, {
        from: getFromAddress(provider, 'Calendario Solidale'),
        to: notifyEmail,
        subject,
        html
    }, null);
}

/**
 * Invia al destinatario la gift card di Natale (20 €), acquistata a parte dal calendario.
 * Non usa il flusso delle adozioni: il testo non parla di giorni adottati.
 * @param {Object} card - Riga della tabella natale_gift_cards
 */
async function sendNataleGiftCard(card) {
    const provider = getProvider();
    if (!card.recipient_email) {
        throw new Error(`Email destinatario mancante per gift card di Natale ${card.id}`);
    }

    const { imagePath, imageBase64, imageMime } = loadCardImage({ gift_card_design: card.card_design }, provider);
    const donorName = card.donor_name || 'Un amico generoso';
    const giftCardUrl = nataleCardUrl(card);
    const messageHtml = card.message
        ? `<p style="font-style: italic;">"${card.message.replace(/</g, '&lt;')}"</p>`
        : '';
    let imageTag = '';
    if (imagePath && imageBase64) {
        imageTag = `<img src="data:${imageMime};base64,${imageBase64}" alt="Gift Card di Natale" style="width: 100%; height: auto; border-radius: 12px; display: block;">`;
    } else if (imagePath) {
        imageTag = `<img src="cid:giftcard" alt="Gift Card di Natale" style="width: 100%; height: auto; border-radius: 12px; display: block;">`;
    }

    const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
<h2 style="color: #b22222;">🎄 Buon Natale, ${card.recipient_name.replace(/</g, '&lt;')}!</h2>
<p><strong>${donorName.replace(/</g, '&lt;')}</strong> ti ha regalato una gift card di Natale del Calendario Solidale Effatà.</p>
${messageHtml}
${imageTag}
<p style="text-align: center; margin: 24px 0;"><a href="${giftCardUrl}" style="background: #c0392b; color: #fff; padding: 14px 24px; border-radius: 12px; text-decoration: none; font-weight: 600;">🎁 Apri il tuo regalo</a></p>
<p>Questa gift card sostiene i bambini della Casa Famiglia Effatà in Uganda: cibo, istruzione e cure.</p>
<p style="color: #777; font-size: 12px;">Grazie di cuore da parte dei nostri bambini.</p>
</div>`;

    const mailOptions = {
        from: getFromAddress(provider),
        to: card.recipient_email,
        subject: `🎄 Una gift card di Natale per te da ${donorName}`,
        html
    };

    const result = await sendEmail(provider, mailOptions, imagePath);
    console.log(`Gift card di Natale ${card.id} inviata via ${provider} a ${card.recipient_email}`);
    return result;
}

/**
 * Link alla pagina di apertura della gift card di Natale (si apre dal 25 dicembre alle 9:00)
 */
function nataleCardUrl(card) {
    const baseUrl = process.env.NATALE_BASE_URL || process.env.BASE_URL || 'https://calendario.effataitalia.it';
    return `${baseUrl}/natale-card.html?id=${encodeURIComponent(card.payment_id)}`;
}

/**
 * Conferma a chi ha pagato la gift card di Natale, con il link da condividere su WhatsApp.
 * Non parte se chi paga non ha lasciato un'email.
 * @param {Object} card - Riga della tabella natale_gift_cards
 */
async function sendNataleDonorConfirmation(card) {
    const provider = getProvider();
    if (!card.donor_email) return null;

    const link = nataleCardUrl(card);
    const whatsappText = `🎄 Ti ho regalato una gift card di Natale per la Casa Famiglia Effatà in Uganda. Apri qui il tuo regalo: ${link}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
    const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
<h2 style="color: #b22222;">Grazie, ${(card.donor_name || '').replace(/</g, '&lt;')}!</h2>
<p>La tua gift card di Natale per <strong>${card.recipient_name.replace(/</g, '&lt;')}</strong> è stata pagata.</p>
<p>Arriverà per email al destinatario il <strong>25 dicembre alle 9:00</strong>. Se vuoi, puoi anche inoltrargli subito il link di apertura:</p>
<p style="text-align: center; margin: 24px 0;"><a href="${whatsappUrl}" style="background: #25D366; color: #fff; padding: 14px 24px; border-radius: 12px; text-decoration: none; font-weight: 600;">Condividi su WhatsApp</a></p>
<p style="font-size: 12px; color: #777;">Link diretto: ${link}</p>
</div>`;

    const result = await sendEmail(provider, {
        from: getFromAddress(provider),
        to: card.donor_email,
        subject: `🎄 Gift card di Natale pagata per ${card.recipient_name}`,
        html
    }, null);
    console.log(`Conferma gift card di Natale ${card.id} inviata via ${provider} a ${card.donor_email}`);
    return result;
}

module.exports = {
    sendNataleDonorConfirmation,
    sendNataleGiftCard,
    sendGiftCard,
    sendAssociationReport,
    sendScheduledGiftCard,
    sendPersonalReminder,
    sendGiftCardToRecipient,
    sendDonationNotification,
    sendDonorGiftCard
};
