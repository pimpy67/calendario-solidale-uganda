/**
 * natale-avvento.js - Calendario dell'Avvento di Effatà + scelta del disegno per il regalo
 *
 * - Il calendario mostra una porta al giorno (testo e disegno), in base alla data di Roma.
 * - Il carosello mostra tutti i 25 disegni solo come immagine, per scegliere il regalo.
 * - Il modulo acquista la gift card di Natale (20 €) con il disegno scelto.
 * Per le prove si può simulare un giorno con ?oggi=2026-12-10.
 */
(function () {
    const YEAR = 2026;
    const MONTH = 12;
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const STORAGE_KEY = 'avvento-aperte-2026';

    let doors = [];
    let selectedDay = 1;

    // Data di oggi in Europe/Rome: { year, month, day }
    function todayInRome() {
        const override = new URLSearchParams(window.location.search).get('oggi');
        if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
            const [y, m, d] = override.split('-').map(Number);
            return { year: y, month: m, day: d };
        }
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const get = type => Number(parts.find(p => p.type === type).value);
        return { year: get('year'), month: get('month'), day: get('day') };
    }

    // Stato di una porta: 'locked' (non ancora), 'today' (oggi), 'unlocked' (già disponibile)
    function doorState(day, today) {
        if (today.year !== YEAR || today.month !== MONTH) {
            return (today.year > YEAR || (today.year === YEAR && today.month > MONTH)) ? 'unlocked' : 'locked';
        }
        if (day < today.day) return 'unlocked';
        if (day === today.day) return 'today';
        return 'locked';
    }

    // Porte già aperte da questo browser (comodità di chi visita, non è un dato condiviso)
    function readOpened() {
        try {
            return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
        } catch (e) {
            return new Set();
        }
    }
    function saveOpened(set) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
        } catch (e) { /* memoria del browser non disponibile */ }
    }

    function startSnow() {
        if (reducedMotion) return;
        const container = document.getElementById('snow');
        const count = window.innerWidth < 600 ? 20 : 34;
        for (let i = 0; i < count; i++) {
            const flake = document.createElement('span');
            flake.className = 'flake';
            flake.textContent = '❄';
            flake.style.left = `${Math.random() * 100}%`;
            flake.style.fontSize = `${9 + Math.random() * 14}px`;
            flake.style.animationDuration = `${8 + Math.random() * 10}s`;
            flake.style.animationDelay = `${-Math.random() * 15}s`;
            container.appendChild(flake);
        }
    }

    function openModal(door) {
        // Porta senza contenuto ancora pronto: nessuna finestra vuota
        if (!door.text && !door.image) {
            document.getElementById('today-line').textContent = `La porta ${door.day} arriverà presto.`;
            return;
        }
        const modal = document.getElementById('modal');
        document.getElementById('modal-title').textContent = door.title;
        document.getElementById('modal-text').textContent = door.text;
        const img = document.getElementById('modal-img');
        if (door.image) {
            img.src = door.image;
            img.alt = `Disegno della porta ${door.day}`;
            img.hidden = false;
        } else {
            img.hidden = true;
        }
        modal.hidden = false;
        document.getElementById('modal-close').focus();
    }

    function closeModal() {
        document.getElementById('modal').hidden = true;
    }

    function renderDoors(today) {
        const container = document.getElementById('doors');
        const opened = readOpened();

        doors.forEach(door => {
            const state = doorState(door.day, today);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'door';
            btn.setAttribute('role', 'listitem');
            btn.setAttribute('aria-label', `Porta ${door.day}`);

            const num = document.createElement('span');
            num.className = 'num';
            num.textContent = door.day;
            btn.appendChild(num);

            if (state === 'locked') {
                btn.classList.add('locked');
                btn.setAttribute('aria-disabled', 'true');
            }
            if (state === 'today') btn.classList.add('today');
            if (opened.has(door.day)) btn.classList.add('open');

            btn.addEventListener('click', () => {
                if (state === 'locked') {
                    document.getElementById('today-line').textContent = `La porta ${door.day} si apre il ${door.day} dicembre.`;
                    return;
                }
                const wasOpen = opened.has(door.day);
                opened.add(door.day);
                saveOpened(opened);
                btn.classList.add('open');
                if (!wasOpen && !reducedMotion) {
                    btn.classList.add('just-opened');
                    btn.addEventListener('animationend', () => btn.classList.remove('just-opened'), { once: true });
                }
                openModal(door);
            });

            container.appendChild(btn);
        });
    }

    function renderTodayLine(today) {
        const line = document.getElementById('today-line');
        if (today.year === YEAR && today.month === MONTH) {
            line.textContent = today.day <= 25
                ? `Oggi è il giorno ${today.day}: la porta ${today.day} è aperta.`
                : 'Buon Natale!';
        } else if (today.year === YEAR && today.month < MONTH) {
            line.textContent = 'Le porte si aprono dal 1 dicembre.';
        } else {
            line.textContent = '';
        }
    }

    // Carosello: tutti i 25 disegni, solo immagine (il testo resta nel calendario)
    function renderCarousel() {
        const track = document.getElementById('carousel-track');
        doors.filter(d => d.image).forEach(door => {
            const slide = document.createElement('button');
            slide.type = 'button';
            slide.className = 'slide';
            slide.dataset.day = door.day;
            slide.setAttribute('aria-label', `Scegli il disegno della porta ${door.day}`);

            const img = document.createElement('img');
            img.src = door.image;
            img.alt = `Disegno della porta ${door.day}`;
            img.loading = 'lazy';
            slide.appendChild(img);

            const label = document.createElement('span');
            label.className = 'slide-label';
            label.textContent = `Porta ${door.day}`;
            slide.appendChild(label);

            slide.addEventListener('click', () => selectDay(door.day));
            track.appendChild(slide);
        });

        const step = () => {
            const slide = track.querySelector('.slide');
            return slide ? slide.offsetWidth + 12 : 200;
        };
        document.getElementById('carousel-prev').addEventListener('click', () => {
            track.scrollBy({ left: -step(), behavior: reducedMotion ? 'auto' : 'smooth' });
        });
        document.getElementById('carousel-next').addEventListener('click', () => {
            track.scrollBy({ left: step(), behavior: reducedMotion ? 'auto' : 'smooth' });
        });
    }

    // Sceglie un disegno: aggiorna la scritta e l'anteprima nel modulo
    function selectDay(day) {
        selectedDay = day;
        const door = doors.find(d => d.day === day);
        document.getElementById('selected-label').textContent = `Porta ${day}`;
        const preview = document.getElementById('gift-preview');
        preview.src = door ? door.image : '';
        document.querySelectorAll('.slide').forEach(s => {
            s.classList.toggle('selected', Number(s.dataset.day) === day);
        });
    }

    function showGiftError(message) {
        const el = document.getElementById('gift-error');
        el.textContent = message;
        el.hidden = false;
    }

    function setupGiftForm() {
        const form = document.getElementById('gift-form');
        const submitBtn = document.getElementById('gift-submit');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            document.getElementById('gift-error').hidden = true;

            const body = {
                card_design: `porta${selectedDay}`,
                donor_name: document.getElementById('gift-donor-name').value.trim(),
                donor_email: document.getElementById('gift-donor-email').value.trim(),
                recipient_name: document.getElementById('gift-recipient-name').value.trim(),
                recipient_email: document.getElementById('gift-recipient-email').value.trim(),
                message: document.getElementById('gift-message').value.trim()
            };

            if (!body.donor_name || !body.recipient_name || !body.recipient_email) {
                return showGiftError('Compila il tuo nome, il nome di chi riceve e la sua email.');
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Un momento...';
            try {
                const response = await fetch('/api/natale/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await response.json();
                if (!response.ok || !data.stripe_url) {
                    throw new Error(data.message || 'Errore nella creazione del pagamento');
                }
                window.location.href = data.stripe_url;
            } catch (err) {
                showGiftError(err.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Regala questo disegno · 20 €';
            }
        });

        // Ritorno da Stripe con pagamento riuscito
        if (new URLSearchParams(window.location.search).get('ok') === '1') {
            const banner = document.getElementById('gift-banner');
            banner.hidden = false;
            banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    async function init() {
        startSnow();
        const today = todayInRome();
        renderTodayLine(today);

        document.getElementById('modal-close').addEventListener('click', closeModal);
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target.id === 'modal') closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });

        setupGiftForm();

        try {
            const response = await fetch('/data/avvento.json');
            const data = await response.json();
            doors = data.doors;
            renderDoors(today);
            // Con la vendita spenta (contenuti non ancora pronti) si nascondono carosello e modulo
            if (data.vendita_attiva !== true) {
                document.getElementById('choose-section').hidden = true;
                document.getElementById('gift-section').hidden = true;
            } else {
                renderCarousel();
                selectDay(1);
            }
        } catch (e) {
            document.getElementById('today-line').textContent = 'Il calendario non è disponibile in questo momento.';
        }
    }

    init();
})();
