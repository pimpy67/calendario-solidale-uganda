/**
 * Calendar.js - Gestione del calendario solidale
 * Renderizza la griglia del calendario e gestisce la navigazione tra i mesi
 */

const Calendar = (function() {
    // Configurazione
    const DONATION_AMOUNT = 50;

    // Nomi mesi in italiano
    const MONTHS = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile',
        'Maggio', 'Giugno', 'Luglio', 'Agosto',
        'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];

    // Immagini di sfondo per 22 mesi (mar 2026 - dic 2027)
    const MONTH_IMAGES = [
        // 2026 (mobile/verticale) - inizia da marzo
        '/images/months/mobile_2026/03_2026 verticale.jpeg',     // marzo 2026
        '/images/months/mobile_2026/04_2026 verticale.jpeg',     // aprile 2026
        '/images/months/mobile_2026/05_2026 verticale.jpeg',     // maggio 2026
        '/images/months/mobile_2026/06_2026 verticale.jpeg',     // giugno 2026
        '/images/months/mobile_2026/07_2026 verticale.jpeg',     // luglio 2026
        '/images/months/mobile_2026/08_2026 verticale.jpeg',     // agosto 2026
        '/images/months/mobile_2026/09_2026 verticale.jpeg',     // settembre 2026
        '/images/months/mobile_2026/10_2026 verticale.jpeg',     // ottobre 2026
        '/images/months/mobile_2026/11_2026 verticale.jpeg',     // novembre 2026
        '/images/months/mobile_2026/12_2026 verticale.jpeg',     // dicembre 2026
        // 2027 (mobile/verticale)
        '/images/months/mobile_2027/01_2027 verticale.jpeg',     // gennaio 2027
        '/images/months/mobile_2027/02_2027 verticale.jpeg',     // febbraio 2027
        '/images/months/mobile_2027/03_2027 verticale.jpeg',     // marzo 2027
        '/images/months/mobile_2027/04_2027 verticale.jpeg',     // aprile 2027
        '/images/months/mobile_2027/05_2027 verticale.jpeg',     // maggio 2027
        '/images/months/mobile_2027/06_2027 verticale.jpeg',     // giugno 2027
        '/images/months/mobile_2027/07_2027 verticale.jpeg',     // luglio 2027
        '/images/months/mobile_2027/08_2027 verticale.jpeg',     // agosto 2027
        '/images/months/mobile_2027/09_2027 vertcale.jpeg',      // settembre 2027 (nota typo nel file)
        '/images/months/mobile_2027/10_2027 verticale.jpeg',     // ottobre 2027
        '/images/months/mobile_2027/11_2027 verticale.jpeg',     // novembre 2027
        '/images/months/mobile_2027/12_ 2027 verticale.jpeg'     // dicembre 2027
    ];

    // Desktop version (orizzontale)
    const MONTH_IMAGES_DESKTOP = [
        // 2026 (desktop/orizzontale) - inizia da marzo
        '/images/months/desktop_2027/03_2026 orizzontale.jpeg',  // marzo 2026
        '/images/months/desktop_2027/04 2026 orizzontale.jpeg',  // aprile 2026
        '/images/months/desktop_2027/05_2026 orizzontale.jpeg',  // maggio 2026
        '/images/months/desktop_2027/06_2026 orizzontale.jpeg',  // giugno 2026
        '/images/months/desktop_2027/07_2026 orizzontale.jpeg',  // luglio 2026
        '/images/months/desktop_2027/08_2026 orizzontale.jpeg',  // agosto 2026
        '/images/months/desktop_2027/09_2026 orizzontale.jpeg',  // settembre 2026
        '/images/months/desktop_2027/10_2026 orizzontale.jpeg',  // ottobre 2026
        '/images/months/desktop_2027/11_2026 orizzontale.jpeg',  // novembre 2026
        '/images/months/desktop_2027/12_2026 orizzontale.jpeg',  // dicembre 2026
        // 2027 (desktop/orizzontale)
        '/images/months/desktop_2026/01_2027 orizzontale.jpeg',  // gennaio 2027
        '/images/months/desktop_2026/02_2027 orizzontale.jpeg',  // febbraio 2027
        '/images/months/desktop_2026/03_2027 orizzontale.jpeg',  // marzo 2027
        '/images/months/desktop_2026/04_2027 orizzontale.jpeg',  // aprile 2027
        '/images/months/desktop_2026/05_2027 arizzontale.jpeg',  // maggio 2027
        '/images/months/desktop_2026/06_2027 orizzontale.jpeg',  // giugno 2027
        '/images/months/desktop_2026/07_2027 orizzontale.jpeg',  // luglio 2027
        '/images/months/desktop_2026/08_2027 orizzontale.jpeg',  // agosto 2027
        '/images/months/desktop_2026/09_2027 orizzontale.jpeg',  // settembre 2027
        '/images/months/desktop_2026/10_2027 orizzontale.jpeg',  // ottobre 2027
        '/images/months/desktop_2026/11_2027 orizzontale.jpeg',  // novembre 2027
        '/images/months/desktop_2026/12_2027 orizzontale.jpeg'   // dicembre 2027
    ];

    /**
     * Determina il breakpoint responsive (mobile < 768px)
     */
    function isMobileLayout() {
        return window.innerWidth < 768;
    }

    // Stato corrente - indice 0-21 (22 mesi da mar 2026 a dic 2027)
    // Inizialmente mostra marzo 2026 (indice 0)
    let currentMonthIndex = 0;
    let donations = {}; // { "2026-1-15": { donor: "Mario", status: "completed" } }

    // Elementi DOM
    let daysGrid;
    let monthTitle;
    let calendarBackground;
    let adoptedCountEl;
    let totalRaisedEl;

    /**
     * Ottiene anno e mese da indice (0-21, inizia da marzo 2026)
     */
    function getYearMonth(index) {
        const globalMonth = index + 3; // Inizia da marzo 2026 (mese 3)
        const year = 2026 + Math.floor((globalMonth - 1) / 12);
        const month = ((globalMonth - 1) % 12) + 1;
        return { year, month };
    }

    /**
     * Inizializza il calendario
     */
    function init() {
        // Recupera elementi DOM
        daysGrid = document.getElementById('daysGrid');
        monthTitle = document.getElementById('monthTitle');
        calendarBackground = document.getElementById('calendarBackground');
        adoptedCountEl = document.getElementById('adoptedCount');
        totalRaisedEl = document.getElementById('totalRaised');

        // Setup navigazione
        document.getElementById('prevMonth').addEventListener('click', prevMonth);
        document.getElementById('nextMonth').addEventListener('click', nextMonth);

        // Aggiorna immagine di sfondo e anteprima quando cambia il viewport (responsive)
        window.addEventListener('resize', () => {
            const { year, month } = getYearMonth(currentMonthIndex);
            const monthName = MONTHS[month - 1];
            updateBackground();
            updatePreview(monthName, year);
        });

        // Carica donazioni dal server e renderizza
        loadDonations().then(() => {
            render();
            updateStats();
            
            // Assicura che la preview sia inizializzata
            const { year, month } = getYearMonth(currentMonthIndex);
            const monthName = MONTHS[month - 1];
            updatePreview(monthName, year);
            
            // Inizializza stato pulsanti di navigazione
            updateNavigationButtons();
        });
    }

    /**
     * Carica le donazioni dal server (entrambi gli anni)
     */
    async function loadDonations() {
        try {
            // Carica donazioni per 2026 e 2027
            const response2026 = await fetch('/api/donations/2026');
            const response2027 = await fetch('/api/donations/2027');
            
            if (response2026.ok) {
                const data2026 = await response2026.json();
                data2026.forEach(d => {
                    const key = `${d.year}-${d.month}-${d.day}`;
                    donations[key] = {
                        donor: d.is_anonymous ? 'ADOTTATO' : d.donor_name,
                        status: d.payment_status
                    };
                });
            }
            
            if (response2027.ok) {
                const data2027 = await response2027.json();
                data2027.forEach(d => {
                    const key = `${d.year}-${d.month}-${d.day}`;
                    donations[key] = {
                        donor: d.is_anonymous ? 'ADOTTATO' : d.donor_name,
                        status: d.payment_status
                    };
                });
            }
        } catch (error) {
            console.error('Errore caricamento donazioni:', error);
        }
    }

    /**
     * Renderizza il calendario per il mese corrente
     */
    function render() {
        const { year, month } = getYearMonth(currentMonthIndex);
        const monthName = MONTHS[month - 1];
        
        // Aggiorna titolo
        monthTitle.textContent = `${monthName} ${year}`;

        // Aggiorna immagine di sfondo
        updateBackground();

        // Aggiorna anteprima sidebar
        updatePreview(monthName, year);

        // Svuota griglia
        daysGrid.innerHTML = '';

        // Calcola giorni del mese
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const daysInMonth = lastDay.getDate();

        // Calcola giorno della settimana del primo giorno (0=Domenica, 1=Lunedi, ...)
        // Convertiamo per avere Lunedi=0
        let startDay = firstDay.getDay() - 1;
        if (startDay < 0) startDay = 6; // Domenica diventa 6

        // Aggiungi celle vuote per allineamento
        for (let i = 0; i < startDay; i++) {
            const emptyCell = createDayCell(null);
            daysGrid.appendChild(emptyCell);
        }

        // Aggiungi giorni del mese
        for (let day = 1; day <= daysInMonth; day++) {
            const key = `${year}-${month}-${day}`;
            const donation = donations[key];
            const cell = createDayCell(day, donation, year, month);
            daysGrid.appendChild(cell);
        }
    }

    /**
     * Crea una cella del calendario
     */
    function createDayCell(day, donation = null, year = 2026, month = 1) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';

        if (day === null) {
            cell.classList.add('empty');
            return cell;
        }

        // Determina stato
        let status = 'available';
        let donorName = '';

        if (donation) {
            if (donation.status === 'completed') {
                status = 'adopted';
                donorName = donation.donor || 'ADOTTATO';
            } else if (donation.status === 'pending') {
                status = 'pending';
            }
        }

        cell.classList.add(status);
        cell.dataset.day = day;
        cell.dataset.month = month;
        cell.dataset.year = year;

        // Contenuto cella
        const dayNumber = document.createElement('span');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        cell.appendChild(dayNumber);

        // Se adottato, mostra nome donatore
        if (status === 'adopted' || status === 'pending') {
            const dayDonor = document.createElement('span');
            dayDonor.className = 'day-donor';
            dayDonor.textContent = status === 'pending' ? 'In attesa...' : donorName;
            cell.appendChild(dayDonor);

            // Icone cuore
            const icons = document.createElement('div');
            icons.className = 'day-icons';
            icons.innerHTML = '<span class="heart-icon">&#9825;</span><span class="heart-icon">&#9829;</span>';
            cell.appendChild(icons);
        }

        // Click handler per celle disponibili
        if (status === 'available') {
            cell.addEventListener('click', () => {
                onDayClick(day, month, year);
            });
        }

        return cell;
    }

    /**
     * Aggiorna l'immagine di sfondo con responsivo
     */
    function updateBackground() {
        const isSmallScreen = isMobileLayout();
        const images = isSmallScreen ? MONTH_IMAGES : MONTH_IMAGES_DESKTOP;
        const imageUrl = images[currentMonthIndex];
        calendarBackground.style.backgroundImage = `url('${imageUrl}')`;
    }

    /**
     * Aggiorna l'anteprima nella sidebar
     */
    function updatePreview(monthName, year) {
        // Capitalizza il primo carattere del nome mese
        const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        
        // Aggiorna il titolo
        const previewTitle = document.getElementById('previewTitle');
        if (previewTitle) {
            previewTitle.textContent = `${capitalizedMonth} ${year}`;
        }
        
        // Aggiorna l'immagine
        const previewImage = document.getElementById('previewImage');
        if (previewImage) {
            const isSmallScreen = isMobileLayout();
            const images = isSmallScreen ? MONTH_IMAGES : MONTH_IMAGES_DESKTOP;
            const imageUrl = images[currentMonthIndex];
            previewImage.src = imageUrl;
        }
    }

    /**
     * Aggiorna le statistiche
     */
    function updateStats() {
        let adopted = 0;
        Object.values(donations).forEach(d => {
            if (d.status === 'completed') {
                adopted++;
            }
        });

        adoptedCountEl.textContent = adopted;
        totalRaisedEl.textContent = (adopted * DONATION_AMOUNT).toLocaleString('it-IT');
    }

    /**
     * Naviga al mese precedente
     */
    function prevMonth() {
        if (currentMonthIndex > 0) {
            currentMonthIndex--;
            render();
            updateNavigationButtons();
        }
    }

    /**
     * Naviga al mese successivo
     */
    function nextMonth() {
        if (currentMonthIndex < 21) {
            currentMonthIndex++;
            render();
            updateNavigationButtons();
        }
    }

    /**
     * Aggiorna stato pulsanti prev/next (disabilitati agli estremi)
     */
    function updateNavigationButtons() {
        const prevBtn = document.getElementById('prevMonth');
        const nextBtn = document.getElementById('nextMonth');
        
        if (prevBtn) {
            prevBtn.disabled = currentMonthIndex === 0;
            prevBtn.style.opacity = currentMonthIndex === 0 ? '0.4' : '1';
        }
        if (nextBtn) {
            nextBtn.disabled = currentMonthIndex === 21;
            nextBtn.style.opacity = currentMonthIndex === 21 ? '0.4' : '1';
        }
    }

    /**
     * Handler click su giorno
     */
    function onDayClick(day, month, year) {
        // Apre il modal di pagamento (gestito da payment.js)
        if (typeof Payment !== 'undefined') {
            Payment.openModal(day, month, year);
        }
    }

    /**
     * Aggiunge una donazione (chiamato dopo pagamento)
     */
    function addDonation(day, month, year, donor, status) {
        const key = `${year}-${month}-${day}`;
        donations[key] = { donor, status };
        render();
        updateStats();
    }

    /**
     * Ricarica le donazioni dal server
     */
    async function refresh() {
        donations = {};
        await loadDonations();
        render();
        updateStats();
    }

    // API pubblica
    return {
        init,
        addDonation,
        refresh,
        MONTHS,
        DONATION_AMOUNT
    };
})();
