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

    // Setup sidebar toggle (mobile)
    setupSidebarToggle();

    // Setup modal About
    setupAboutModal();

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
 * Setup modal Chi Siamo (immagine) e Scopri di Più (testo)
 */
function setupAboutModal() {
    // Modal Chi Siamo (immagine volantino)
    const aboutModal = document.getElementById('aboutModal');
    const openAbout = document.getElementById('openAbout');
    const closeAbout = document.getElementById('closeAbout');
    const closeAboutBtn = document.getElementById('closeAboutBtn');

    function openAboutModal(e) {
        e.preventDefault();
        aboutModal.classList.add('active');
    }

    function closeAboutModal() {
        aboutModal.classList.remove('active');
    }

    if (openAbout) openAbout.addEventListener('click', openAboutModal);
    if (closeAbout) closeAbout.addEventListener('click', closeAboutModal);
    if (closeAboutBtn) closeAboutBtn.addEventListener('click', closeAboutModal);

    aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) closeAboutModal();
    });

    // Modal Scopri di Più (testo)
    const discoverModal = document.getElementById('discoverModal');
    const openDiscover = document.getElementById('openAboutPrimary');
    const closeDiscover = document.getElementById('closeDiscover');
    const closeDiscoverBtn = document.getElementById('closeDiscoverBtn');

    function openDiscoverModal(e) {
        e.preventDefault();
        discoverModal.classList.add('active');
    }

    function closeDiscoverModal() {
        discoverModal.classList.remove('active');
    }

    if (openDiscover) openDiscover.addEventListener('click', openDiscoverModal);
    if (closeDiscover) closeDiscover.addEventListener('click', closeDiscoverModal);
    if (closeDiscoverBtn) closeDiscoverBtn.addEventListener('click', closeDiscoverModal);

    discoverModal.addEventListener('click', (e) => {
        if (e.target === discoverModal) closeDiscoverModal();
    });

    // Escape chiude entrambi
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (aboutModal.classList.contains('active')) closeAboutModal();
            if (discoverModal.classList.contains('active')) closeDiscoverModal();
        }
    });
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
