/**
 * Mailer.js - Invio email gift card
 * Usa Brevo API (HTTP) su Railway, Gmail SMTP in locale
 */

const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const { promisify } = require('util');
const resolve4 = promisify(dns.resolve4);

const MONTHS = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

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
    const giftcardsDir = path.join(__dirname, '../../public/images/gift_card');
    const cardNumber = cardName.replace('card', '');
    const extensions = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'];

    for (const ext of extensions) {
        const filePath = path.join(giftcardsDir, cardNumber + ext);
        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }
    return null;
}

/**
 * Genera il template HTML della gift card
 */
function generateGiftCardHTML(donation, hasImage, imageBase64, imageMime) {
    const monthName = MONTHS[donation.month - 1];
    const donorName = donation.is_anonymous ? 'Un amico generoso' : (donation.donor_name || 'Un amico generoso');
    const recipientName = donation.gift_recipient_name || 'Amico/a';
    const personalMessage = donation.message || '';
    const dateStr = `${donation.day} ${monthName} ${donation.year}`;
    const recipientEmail = donation.email || null;
    const baseUrl = process.env.BASE_URL || 'https://calendario.effataitalia.it';
    const giftCardViewUrl = `${baseUrl}/gift-card/${donation.payment_id}`;
    const whatsappText = `🎉 Ciao ${recipientName}! Oggi è il tuo giorno speciale!\n${donorName} ti ha regalato il ${dateStr} del Calendario Solidale della Casa Famiglia Effata in Uganda ❤\n\nQuesta donazione aiuta a garantire cibo, istruzione e cure ai bambini della Casa Famiglia Effata in Uganda.\nOgni giorno adottato fa la differenza!\nGrazie di Cuore da parte dei nostri bambini\n\nEcco la tua gift card:\n${giftCardViewUrl}\n\nGRAZIE!\n\nhttps://www.effatacharityorganisation.org/`;
    const mailtoUrl = recipientEmail ? giftCardViewUrl : null;

    // Per Resend usiamo immagine base64 inline, per SMTP usiamo cid:
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
                                Hai ricevuto un regalo speciale! <strong>${donorName}</strong> ha adottato un giorno del Calendario Solidale in tuo nome.
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
                                            Donazione di 50,00 &euro;
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
                                            Manda gli auguri a <strong>${recipientName}</strong> — il messaggio è già pronto, puoi modificarlo come vuoi! 💝
                                        </p>
                                        <a href="https://wa.me/?text=${encodeURIComponent(whatsappText)}"
                                           style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 24px; border-radius: 50px; margin: 4px;">
                                            💬 Auguri su WhatsApp
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
 * Invia email tramite Brevo (Sendinblue) API (HTTP - funziona su Railway)
 * Non richiede dominio verificato, solo mittente verificato via email
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
        const base64Content = imageBuffer.toString('base64');
        body.attachment = [{
            name: path.basename(imagePath),
            content: base64Content
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

    const result = await response.json();
    return result;
}

/**
 * Invia email tramite Gmail SMTP (per uso locale)
 */
async function sendViaGmail(mailOptions, imagePath) {
    const transporter = await createTransporter();

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
 * Invia la gift card via email
 * @param {Object} donation - Dati della donazione dal database
 */
async function sendGiftCard(donation) {
    const useBrevo = !!process.env.BREVO_API_KEY;
    const useGmail = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;

    if (!useBrevo && !useGmail) {
        console.warn('Nessun servizio email configurato (BREVO_API_KEY o GMAIL). Gift card non inviata.');
        return;
    }

    // Email anteprima va al DONANTE (che decide come consegnarla al destinatario)
    const donorEmailTo = donation.donor_email || donation.email;
    if (!donorEmailTo) {
        console.warn('Email donante mancante. Gift card non inviata.');
        return;
    }

    // Cerca immagine gift card
    const cardName = donation.gift_card_design || 'card1';
    const imagePath = getGiftCardImagePath(cardName);
    const hasImage = imagePath !== null;

    // Per Brevo, prepara immagine base64 per embed nell'HTML
    let imageBase64 = null;
    let imageMime = 'image/png';
    if (hasImage && useBrevo) {
        const imageBuffer = fs.readFileSync(imagePath);
        imageBase64 = imageBuffer.toString('base64');
        const ext = path.extname(imagePath).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') imageMime = 'image/jpeg';
        else if (ext === '.webp') imageMime = 'image/webp';
        else if (ext === '.gif') imageMime = 'image/gif';
        else if (ext === '.svg') imageMime = 'image/svg+xml';
    }

    // Scegli il from address
    const fromAddress = useBrevo
        ? `Calendario Solidale - Effata <${process.env.GMAIL_USER || 'effataitalia@gmail.com'}>`
        : `"Calendario Solidale - Effatà" <${process.env.GMAIL_USER}>`;

    const mailOptions = {
        from: fromAddress,
        to: donorEmailTo,
        subject: `🎁 Hai adottato il ${donation.day} ${MONTHS[donation.month - 1]} per ${donation.gift_recipient_name || 'qualcuno'}! Ecco la tua gift card`,
        html: generateGiftCardHTML(donation, hasImage, imageBase64, imageMime)
    };

    if (useBrevo) {
        console.log('Invio email tramite Brevo API...');
        const result = await sendViaBrevo(mailOptions, hasImage ? imagePath : null);
        console.log('Gift card email inviata via Brevo:', result.messageId);
        return result;
    } else {
        console.log('Invio email tramite Gmail SMTP...');
        const info = await sendViaGmail(mailOptions, hasImage ? imagePath : null);
        console.log('Gift card email inviata via Gmail:', info.messageId);
        return info;
    }
}

/**
 * Invia la gift card schedulata il giorno del compleanno
 * @param {Object} donation - Dati della donazione dal database
 */
async function sendScheduledGiftCard(donation) {
    const useBrevo = !!process.env.BREVO_API_KEY;
    const useGmail = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;

    if (!useBrevo && !useGmail) return;
    // Email compleanno va al DONANTE con bottone WhatsApp
    const donorEmailTo = donation.donor_email || donation.email;
    if (!donorEmailTo) return;

    const cardName = donation.gift_card_design || 'card1';
    const imagePath = getGiftCardImagePath(cardName);
    const hasImage = imagePath !== null;

    let imageBase64 = null;
    let imageMime = 'image/png';
    if (hasImage && useBrevo) {
        const imageBuffer = fs.readFileSync(imagePath);
        imageBase64 = imageBuffer.toString('base64');
        const ext = path.extname(imagePath).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') imageMime = 'image/jpeg';
        else if (ext === '.webp') imageMime = 'image/webp';
        else if (ext === '.gif') imageMime = 'image/gif';
        else if (ext === '.svg') imageMime = 'image/svg+xml';
    }

    const fromAddress = useBrevo
        ? `Calendario Solidale - Effata <${process.env.GMAIL_USER || 'effataitalia@gmail.com'}>`
        : `"Calendario Solidale - Effatà" <${process.env.GMAIL_USER}>`;

    const mailOptions = {
        from: fromAddress,
        to: donorEmailTo,
        subject: `🎉 Oggi è il compleanno di ${donation.gift_recipient_name || 'qualcuno'}! Manda gli auguri 💬`,
        html: generateGiftCardHTML(donation, hasImage, imageBase64, imageMime)
    };

    if (useBrevo) {
        const result = await sendViaBrevo(mailOptions, hasImage ? imagePath : null);
        console.log(`Gift card schedulata inviata via Brevo per donazione ${donation.id}`);
        return result;
    } else {
        const info = await sendViaGmail(mailOptions, hasImage ? imagePath : null);
        console.log(`Gift card schedulata inviata via Gmail per donazione ${donation.id}`);
        return info;
    }
}

/**
 * Invia la gift card per email direttamente al destinatario del regalo
 * (chiamato dalla pagina gift-card view quando il donante clicca "Invia per Email")
 */
async function sendGiftCardToRecipient(donation) {
    const useBrevo = !!process.env.BREVO_API_KEY;
    const useGmail = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;

    if (!useBrevo && !useGmail) return;

    const recipientEmail = donation.email;
    if (!recipientEmail) return;

    const cardName = donation.gift_card_design || 'card1';
    const imagePath = getGiftCardImagePath(cardName);
    const hasImage = imagePath !== null;

    let imageBase64 = null;
    let imageMime = 'image/png';
    if (hasImage && useBrevo) {
        const imageBuffer = fs.readFileSync(imagePath);
        imageBase64 = imageBuffer.toString('base64');
        const ext = path.extname(imagePath).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') imageMime = 'image/jpeg';
        else if (ext === '.webp') imageMime = 'image/webp';
        else if (ext === '.gif') imageMime = 'image/gif';
        else if (ext === '.svg') imageMime = 'image/svg+xml';
    }

    const fromAddress = useBrevo
        ? `Calendario Solidale - Effata <${process.env.GMAIL_USER || 'effataitalia@gmail.com'}>`
        : `"Calendario Solidale - Effatà" <${process.env.GMAIL_USER}>`;

    const recipientName = donation.gift_recipient_name || 'Amico/a';

    const mailOptions = {
        from: fromAddress,
        to: recipientEmail,
        subject: `🎁 Hai ricevuto un regalo speciale per il tuo compleanno, ${recipientName}!`,
        html: generateGiftCardHTML(donation, hasImage, imageBase64, imageMime)
    };

    if (useBrevo) {
        const result = await sendViaBrevo(mailOptions, hasImage ? imagePath : null);
        console.log(`Gift card inviata al destinatario ${recipientEmail} per donazione ${donation.id}`);
        return result;
    } else {
        const info = await sendViaGmail(mailOptions, hasImage ? imagePath : null);
        console.log(`Gift card inviata al destinatario ${recipientEmail} per donazione ${donation.id}`);
        return info;
    }
}

/**
 * Invia notifica di avvenuta donazione all'associazione
 * @param {Object} donation - Dati della donazione dal database
 */
async function sendDonationNotification(donation) {
    const notifyEmail = process.env.ASSOCIATION_EMAIL || process.env.GMAIL_USER;
    if (!notifyEmail) {
        console.warn('Nessuna email associazione configurata (ASSOCIATION_EMAIL o GMAIL_USER). Notifica non inviata.');
        return;
    }

    const useBrevo = !!process.env.BREVO_API_KEY;
    const useGmail = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;

    if (!useBrevo && !useGmail) {
        console.warn('Nessun servizio email configurato. Notifica non inviata.');
        return;
    }

    const monthName = MONTHS[donation.month - 1];
    const dateStr = `${donation.day} ${monthName} ${donation.year}`;
    const donorName = donation.is_anonymous ? 'Anonimo' : (donation.donor_name || 'N/D');
    const donorSurname = donation.donor_surname || '';
    const donorCF = donation.donor_cf || 'Non fornito';
    const donorEmail = donation.donor_email || 'Non fornita';
    const amount = donation.amount || 50;

    const fromAddress = useBrevo
        ? `Calendario Solidale <${process.env.GMAIL_USER || 'effataitalia@gmail.com'}>`
        : `"Calendario Solidale" <${process.env.GMAIL_USER}>`;

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
        from: fromAddress,
        to: notifyEmail,
        subject: `Donazione confermata: ${donorName} ${donorSurname} - ${dateStr} (${amount.toFixed(2)}€)`,
        html
    };

    try {
        if (useBrevo) {
            await sendViaBrevo(mailOptions, null);
        } else {
            await sendViaGmail(mailOptions, null);
        }
        console.log(`Notifica donazione #${donation.id} inviata a ${notifyEmail}`);
    } catch (error) {
        console.error('Errore invio notifica associazione:', error);
    }
}

module.exports = {
    sendGiftCard,
    sendScheduledGiftCard,
    sendGiftCardToRecipient,
    sendDonationNotification
};
