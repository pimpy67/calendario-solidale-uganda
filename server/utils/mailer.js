/**
 * Mailer.js - Invio email gift card con Nodemailer
 */

const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const MONTHS = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

/**
 * Crea il transporter Nodemailer con Gmail
 */
function createTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
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
    // cardName è tipo "card1", "card2" etc. - i file sono 1.png, 2.png etc.
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
function generateGiftCardHTML(donation, hasImage) {
    const monthName = MONTHS[donation.month - 1];
    const donorName = donation.is_anonymous ? 'Un amico generoso' : (donation.donor_name || 'Un amico generoso');
    const recipientName = donation.gift_recipient_name || 'Amico/a';
    const personalMessage = donation.message || '';
    const dateStr = `${donation.day} ${monthName} ${donation.year}`;

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
                            <img src="cid:giftcard" alt="Gift Card" style="width: 100%; height: auto; border-radius: 12px; display: block;">
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
 * Invia la gift card via email
 * @param {Object} donation - Dati della donazione dal database
 */
async function sendGiftCard(donation) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('Credenziali Gmail non configurate. Gift card non inviata.');
        return;
    }

    if (!donation.email) {
        console.warn('Email destinatario mancante. Gift card non inviata.');
        return;
    }

    const transporter = createTransporter();
    const donorName = donation.is_anonymous ? 'Un amico generoso' : (donation.donor_name || 'Qualcuno');

    // Cerca immagine gift card
    const cardName = donation.gift_card_design || 'card1';
    const imagePath = getGiftCardImagePath(cardName);
    const hasImage = imagePath !== null;

    const mailOptions = {
        from: `"Calendario Solidale - Effatà" <${process.env.GMAIL_USER}>`,
        to: donation.email,
        subject: `${donorName} ti ha regalato un giorno del Calendario Solidale!`,
        html: generateGiftCardHTML(donation, hasImage)
    };

    // Allega immagine gift card come inline
    if (hasImage) {
        mailOptions.attachments = [{
            filename: path.basename(imagePath),
            path: imagePath,
            cid: 'giftcard'
        }];
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('Gift card email inviata:', info.messageId);
    return info;
}

module.exports = {
    sendGiftCard
};
