/**
 * avvento-view.js - Vista "Avvento" dentro il calendario di novembre e dicembre 2026
 *
 * Mostra le 25 porte al posto della griglia delle adozioni. Le porte si aprono
 * in base alla data di Roma; per le prove si può simulare un giorno con ?oggi=2026-12-10.
 */
(function () {
    const YEAR = 2026;
    const MONTH = 12;
    const STORAGE_KEY = 'avvento-aperte-2026';
    let doors = null;

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

    function doorState(day, today) {
        if (today.year !== YEAR || today.month !== MONTH) {
            return (today.year > YEAR || (today.year === YEAR && today.month > MONTH)) ? 'unlocked' : 'locked';
        }
        if (day < today.day) return 'unlocked';
        if (day === today.day) return 'today';
        return 'locked';
    }

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

    function openModal(door) {
        const modal = document.getElementById('adventModal');
        document.getElementById('adventModalTitle').textContent = door.text ? door.title : `Porta ${door.day}`;
        document.getElementById('adventModalText').textContent = door.text || 'Il contenuto di questa porta arriverà presto.';
        const img = document.getElementById('adventModalImg');
        if (door.image) {
            img.src = door.image;
            img.alt = `Disegno della porta ${door.day}`;
            img.hidden = false;
        } else {
            img.hidden = true;
        }
        modal.hidden = false;
        document.getElementById('adventModalClose').focus();
    }

    function closeModal() {
        document.getElementById('adventModal').hidden = true;
    }

    function renderDoors() {
        const container = document.getElementById('adventDoors');
        container.innerHTML = '';
        const today = todayInRome();
        const opened = readOpened();

        doors.forEach(door => {
            const state = doorState(door.day, today);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'advent-door';
            btn.setAttribute('role', 'listitem');
            btn.setAttribute('aria-label', `Porta ${door.day}`);
            btn.textContent = door.day;

            if (state === 'locked') btn.classList.add('locked');
            if (state === 'today') btn.classList.add('today');
            if (opened.has(door.day)) btn.classList.add('open');

            btn.addEventListener('click', () => {
                if (state === 'locked') {
                    btn.classList.add('shake');
                    return;
                }
                opened.add(door.day);
                saveOpened(opened);
                btn.classList.add('open');
                openModal(door);
            });

            container.appendChild(btn);
        });
    }

    async function show() {
        if (!doors) {
            try {
                const response = await fetch('/data/avvento.json');
                doors = (await response.json()).doors;
            } catch (e) {
                document.getElementById('adventDoors').textContent = 'Il calendario dell\'Avvento non è disponibile in questo momento.';
                return;
            }
        }
        renderDoors();
    }

    document.getElementById('adventModalClose').addEventListener('click', closeModal);
    document.getElementById('adventModal').addEventListener('click', (e) => {
        if (e.target.id === 'adventModal') closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    window.AdventView = { show };
})();
