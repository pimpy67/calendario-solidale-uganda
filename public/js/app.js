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

    // Setup QR code popup
    setupQrPopup();

    // Setup sidebar toggle (mobile)
    setupSidebarToggle();

    // Setup bottone Accedi
    setupAccessButton();

    // Setup exit fullscreen button
    setupExitFullscreenButton();

    // Setup modal About
    setupAboutModal();

    // Gestisci ritorno da pagamento Stripe
    handlePaymentReturn();

    console.log('Calendario Solidale inizializzato');
});

/**
 * Setup sidebar toggle per mobile
 */
function setupSidebarToggle() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');

    if (toggle && sidebar) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });

        // Chiudi sidebar cliccando fuori (su mobile)
        document.querySelector('.main').addEventListener('click', () => {
            sidebar.classList.remove('open');
        });
    }
}

/**
 * Setup bottone Accedi (mostra calendario su mobile, navigazione su desktop)
 */
function setupAccessButton() {
    const accessBtn = document.getElementById('accessBtn');
    const sidebar = document.getElementById('sidebar');
    const main = document.querySelector('.main');

    if (accessBtn) {
        accessBtn.addEventListener('click', () => {
            const isMobile = window.innerWidth < 900;
            
            if (isMobile) {
                // Su mobile: mostra il calendario (main), nascondi sidebar
                if (main) {
                    main.classList.add('show-calendar');
                }
                if (sidebar) {
                    sidebar.classList.remove('open');
                }
            }

            // Scroll al calendario
            const calendar = document.getElementById('calendar');
            if (calendar) {
                setTimeout(() => {
                    calendar.scrollIntoView({ behavior: 'smooth' });
                }, 100);

                // Richiama un aggiornamento del calendario per essere sicuri che il mese corrente sia visibile
                if (typeof Calendar !== 'undefined' && Calendar && typeof Calendar.refresh === 'function') {
                    Calendar.refresh();
                }

                // Metti il focus sul titolo del mese
                const monthTitle = document.getElementById('monthTitle');
                if (monthTitle) {
                    monthTitle.setAttribute('tabindex', '-1');
                    monthTitle.focus({ preventScroll: true });
                }
            }
        });
    }
}

/**
 * Setup exit fullscreen button (X) e gestione back su mobile
 */
function setupExitFullscreenButton() {
    const exitBtn = document.getElementById('exitFullscreenBtn');
    const main = document.querySelector('.main');

    if (!exitBtn) return;

    exitBtn.addEventListener('click', () => {
        const isMobile = window.innerWidth < 900;
        
        if (isMobile && main) {
            // Su mobile: torna alla sidebar (home)
            main.classList.remove('show-calendar');
        }
    });

    // Gestisci back button su mobile
    window.addEventListener('popstate', () => {
        const isMobile = window.innerWidth < 900;
        if (isMobile && main && main.classList.contains('show-calendar')) {
            main.classList.remove('show-calendar');
        }
    });

    // Escape chiude il calendario su mobile
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && window.innerWidth < 900) {
            const isMobile = window.innerWidth < 900;
            if (isMobile && main) {
                main.classList.remove('show-calendar');
            }
        }
    });
}

/**
 * Setup modal Chi Siamo (immagine) e Scopri di Più (testo)
 */
function setupAboutModal() {
    // Modal Chi Siamo (immagine + testo combinati)
    const aboutModal = document.getElementById('aboutModal');
    const openAbout = document.getElementById('openAbout');
    const openAboutPrimary = document.getElementById('openAboutPrimary');
    const closeAbout = document.getElementById('closeAbout');
    const closeAboutBtn = document.getElementById('closeAboutBtn');

    function openAboutModal(e) {
        e.preventDefault();
        aboutModal.classList.add('active');
    }

    function closeAboutModal() {
        aboutModal.classList.remove('active');
    }

    // Entrambi i bottoni aprono lo stesso modal
    if (openAbout) openAbout.addEventListener('click', openAboutModal);
    if (openAboutPrimary) openAboutPrimary.addEventListener('click', openAboutModal);
    if (closeAbout) closeAbout.addEventListener('click', closeAboutModal);
    if (closeAboutBtn) closeAboutBtn.addEventListener('click', closeAboutModal);

    aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) closeAboutModal();
    });

    // Escape chiude
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (aboutModal.classList.contains('active')) closeAboutModal();
        }
    });
}

/**
 * Gestisci ritorno da pagamento Stripe (success/cancel)
 */
function handlePaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;

    if (path === '/payment-success') {
        const donationId = params.get('donation_id');

        // Mostra il calendario su mobile
        const main = document.querySelector('.main');
        if (main && window.innerWidth < 900) {
            main.classList.add('show-calendar');
        }

        // Conferma il pagamento (il webhook Stripe potrebbe averlo già fatto)
        if (donationId) {
            fetch(`/api/donations/${donationId}/confirm`, { method: 'POST' })
                .then(() => Calendar.refresh())
                .catch(() => {});
        }

        alert('Grazie per la tua donazione!\n\nIl pagamento è stato completato con successo.\nLa Casa Famiglia in Uganda ti ringrazia di cuore!');

        // Pulisci URL
        window.history.replaceState({}, '', '/');

    } else if (path === '/payment-cancel') {
        alert('Pagamento annullato.\n\nPuoi riprovare quando vuoi selezionando un giorno dal calendario.');
        window.history.replaceState({}, '', '/');
    }
}

/**
 * Setup QR code popup: bottone apre/chiude il popup con il QR
 */
function setupQrPopup() {
    const showBtn = document.getElementById('showQrBtn');
    const popup = document.getElementById('qrPopup');
    const closeBtn = document.getElementById('closeQrPopup');
    if (!showBtn || !popup) return;

    let qrGenerated = false;

    showBtn.addEventListener('click', () => {
        popup.style.display = 'flex';
        if (!qrGenerated) {
            generateQR();
            qrGenerated = true;
        }
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            popup.style.display = 'none';
        });
    }

    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            popup.style.display = 'none';
        }
    });

    function generateQR() {
        const canvas = document.getElementById('qrcodeCanvas');
        if (!canvas) return;

        const url = window.location.origin;
        const size = 180;
        const ctx = canvas.getContext('2d');
        canvas.width = size;
        canvas.height = size;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, 8, 8, size - 16, size - 16);
        };
        img.onerror = function() {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#333333';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('QR non disponibile', size/2, size/2);
        };
        img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=' + (size - 16) + 'x' + (size - 16) + '&data=' + encodeURIComponent(url);
    }
}

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
