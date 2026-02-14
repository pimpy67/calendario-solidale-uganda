/**
 * Calendar.js - Gestione del calendario solidale
 * Renderizza la griglia del calendario e gestisce la navigazione tra i mesi
 */

const Calendar = (function() {
    // Configurazione
    const YEAR = 2026;
    const DONATION_AMOUNT = 50;

    // Nomi mesi in italiano
    const MONTHS = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile',
        'Maggio', 'Giugno', 'Luglio', 'Agosto',
        'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];

    // Immagini di sfondo per ogni mese
    // Desktop per gennaio-febbraio, mobile per marzo-dicembre
    const MONTH_IMAGES = [
        '/images/months/desktop_2026/01_2027 orizzontale.jpeg',  // gennaio
        '/images/months/desktop_2026/02_2027 orizzontale.jpeg',  // febbraio
        '/images/months/mobile_2026/03_2026 verticale.jpeg',     // marzo
        '/images/months/mobile_2026/04_2026 verticale.jpeg',     // aprile
        '/images/months/mobile_2026/05_2026 verticale.jpeg',     // maggio
        '/images/months/mobile_2026/06_2026 verticale.jpeg',     // giugno
        '/images/months/mobile_2026/07_2026 verticale.jpeg',     // luglio
        '/images/months/mobile_2026/08_2026 verticale.jpeg',     // agosto
        '/images/months/mobile_2026/09_2026 verticale.jpeg',     // settembre
        '/images/months/mobile_2026/10_2026 verticale.jpeg',     // ottobre
        '/images/months/mobile_2026/11_2026 verticale.jpeg',     // novembre
        '/images/months/mobile_2026/12_2026 verticale.jpeg'      // dicembre
    ];

    // Stato corrente
    let currentMonth = new Date().getMonth(); // 0-11
    let donations = {}; // { "2026-1-15": { donor: "Mario", status: "completed" } }

    // Elementi DOM
    let daysGrid;
    let monthTitle;
    let calendarBackground;
    let adoptedCountEl;
    let totalRaisedEl;

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

        // Carica donazioni dal server e renderizza
        loadDonations().then(() => {
            render();
            updateStats();
        });
    }

    /**
     * Carica le donazioni dal server
     */
    async function loadDonations() {
        try {
            const response = await fetch(`/api/donations/${YEAR}`);
            if (response.ok) {
                const data = await response.json();
                // Converti array in oggetto per accesso rapido
                data.forEach(d => {
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
        // Aggiorna titolo
        monthTitle.textContent = `${MONTHS[currentMonth]} ${YEAR}`;

        // Aggiorna immagine di sfondo
        updateBackground();

        // Svuota griglia
        daysGrid.innerHTML = '';

        // Calcola giorni del mese
        const firstDay = new Date(YEAR, currentMonth, 1);
        const lastDay = new Date(YEAR, currentMonth + 1, 0);
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
            const key = `${YEAR}-${currentMonth + 1}-${day}`;
            const donation = donations[key];
            const cell = createDayCell(day, donation);
            daysGrid.appendChild(cell);
        }
    }

    /**
     * Crea una cella del calendario
     */
    function createDayCell(day, donation = null) {
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
        cell.dataset.month = currentMonth + 1;
        cell.dataset.year = YEAR;

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
                onDayClick(day, currentMonth + 1, YEAR);
            });
        }

        return cell;
    }

    /**
     * Aggiorna l'immagine di sfondo
     */
    function updateBackground() {
        const imageUrl = MONTH_IMAGES[currentMonth];
        calendarBackground.style.backgroundImage = `url('${imageUrl}')`;
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
        if (currentMonth > 0) {
            currentMonth--;
            render();
        }
    }

    /**
     * Naviga al mese successivo
     */
    function nextMonth() {
        if (currentMonth < 11) {
            currentMonth++;
            render();
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
        YEAR,
        DONATION_AMOUNT
    };
})();
