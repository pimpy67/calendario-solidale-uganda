/**
 * App.js - Inizializzazione dell'applicazione
 */

// Inizializza quando il DOM e pronto
document.addEventListener('DOMContentLoaded', () => {
    // Inizializza calendario
    Calendar.init();

    // Inizializza sistema pagamento
    Payment.init();

    // Setup condivisione social
    setupSocialSharing();

    console.log('Calendario Solidale inizializzato');
});

/**
 * Setup pulsanti condivisione social
 */
function setupSocialSharing() {
    const currentUrl = encodeURIComponent(window.location.href);
    const shareText = encodeURIComponent('Sostieni la Casa Famiglia in Uganda! Adotta un giorno del calendario solidale con una donazione di 50 euro.');

    // WhatsApp
    const whatsappBtn = document.getElementById('shareWhatsapp');
    if (whatsappBtn) {
        whatsappBtn.href = `https://wa.me/?text=${shareText}%20${currentUrl}`;
        whatsappBtn.target = '_blank';
    }

    // Facebook
    const facebookBtn = document.getElementById('shareFacebook');
    if (facebookBtn) {
        facebookBtn.href = `https://www.facebook.com/sharer/sharer.php?u=${currentUrl}`;
        facebookBtn.target = '_blank';
    }

    // Instagram (copia link negli appunti)
    const instagramBtn = document.getElementById('shareInstagram');
    if (instagramBtn) {
        instagramBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(window.location.href).then(() => {
                alert('Link copiato! Incollalo nella tua storia Instagram.');
            }).catch(() => {
                alert('Copia questo link: ' + window.location.href);
            });
        });
    }
}
