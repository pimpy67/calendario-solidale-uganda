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

    // Filastrocca a schermo: la dimensione cresce finché il testo riempie la finestra (lasciando spazio al tasto del retro)
    function fitModalText() {
        const box = document.querySelector('#modal .modal-box');
        const text = document.getElementById('modal-text');
        const limit = box.clientHeight * 0.72;
        let size = 160;
        text.style.fontSize = size + 'px';
        while (size > 14 && text.scrollHeight > limit) {
            size -= 2;
            text.style.fontSize = size + 'px';
        }
    }

    function openModal(door) {
        const modal = document.getElementById('modal');
        // Porta con il testo: finestra quasi a schermo intero con il testo
        if (door.text) {
            modal.classList.remove('cardview');
            modal.classList.add('textview');
            document.getElementById('flip-card').classList.remove('flipped');
            document.getElementById('modal-img').hidden = true;
            document.getElementById('modal-title').textContent = door.title;
            document.getElementById('modal-text').textContent = door.text;
            // Testo sul retro: il tasto passa dal davanti al retro e torna indietro
            modal.dataset.face = 'front';
            modal.dataset.front = door.text;
            modal.dataset.back = door.filastrocca || '';
            const toggle = document.getElementById('flip-toggle');
            toggle.dataset.idle = 'Leggi il retro';
            toggle.textContent = toggle.dataset.idle;
            toggle.setAttribute('aria-pressed', 'false');
            toggle.hidden = !door.filastrocca;
            modal.hidden = false;
            fitModalText();
            document.getElementById('modal-close').focus();
            return;
        }
        modal.classList.remove('textview');
        // Porta con il disegno: la card a tutto schermo
        if (door.disegno) {
            const img = document.getElementById('modal-img');
            img.src = door.disegno;
            img.alt = `Disegno della porta ${door.day}`;
            img.hidden = false;
            document.getElementById('modal-title').textContent = '';
            document.getElementById('modal-text').textContent = '';
            // Filastrocca sul retro della card, se la porta ne ha una
            const toggle = document.getElementById('flip-toggle');
            document.getElementById('flip-text').textContent = door.filastrocca || '';
            // Retro con un disegno proprio: si mostra al posto della card con la filastrocca
            const backImg = document.getElementById('flip-img-back');
            backImg.hidden = !door.disegno_retro;
            if (door.disegno_retro) backImg.src = door.disegno_retro;
            document.querySelector('.card-back').style.display = door.disegno_retro ? 'none' : '';
            document.getElementById('flip-card').classList.remove('flipped');
            toggle.dataset.idle = door.disegno_retro ? 'Vedi il retro' : 'Leggi la filastrocca';
            toggle.textContent = toggle.dataset.idle;
            toggle.setAttribute('aria-pressed', 'false');
            // Porta 1: niente pulsante "Leggi la filastrocca" (si vede solo il disegno)
            toggle.hidden = !(door.filastrocca || door.disegno_retro) || String(door.day) === '1';
            modal.classList.add('cardview');
            modal.hidden = false;
            document.getElementById('modal-close').focus();
            return;
        }
        // Porta senza contenuto ancora pronto: nessuna finestra vuota
        if (!door.text && !door.image && !door.filastrocca) {
            document.getElementById('today-line').textContent = `La porta ${door.day} arriverà presto.`;
            return;
        }
        modal.classList.remove('cardview');
        document.getElementById('flip-card').classList.remove('flipped');
        document.getElementById('flip-toggle').hidden = true;
        document.getElementById('modal-title').textContent = door.title;
        document.getElementById('modal-text').textContent = door.text || door.filastrocca || '';
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
            // Porta con il testo: bianca, sempre visibile, con il testo sulla porta
            const isText = Boolean(door.text);
            if (isText) btn.classList.add('text-door');
            // Porta senza disegno: colore diverso dalle altre
            else if (!door.disegno) btn.classList.add('no-art');
            btn.setAttribute('role', 'listitem');
            btn.setAttribute('aria-label', `Porta ${door.day}`);

            // Porta con disegno: la miniatura riempie la tile, il numero resta sopra.
            // Il disegno pieno resta quello del regalo, del carosello e dell'ingrandimento.
            if (door.disegno && !isText) {
                const thumb = document.createElement('img');
                thumb.className = 'door-img';
                thumb.src = door.miniatura || door.disegno;
                thumb.alt = '';
                thumb.loading = 'lazy';
                btn.appendChild(thumb);

                // Imposte di legno sui due lati: il disegno resta visibile al centro, il tocco le apre
                const shutters = document.createElement('span');
                shutters.className = 'shutters';
                shutters.setAttribute('aria-hidden', 'true');
                shutters.innerHTML = '<span class="shutter left"></span><span class="shutter right"></span>';
                btn.appendChild(shutters);
            }

            const num = document.createElement('span');
            num.className = 'num';
            num.textContent = door.day;
            btn.appendChild(num);
            // Lente di ingrandimento in basso a destra: si apre la finestra
            const lens = document.createElement("span");
            lens.className = "zoom-icon";
            lens.setAttribute("aria-hidden", "true");
            lens.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>';
            btn.appendChild(lens);

            if (isText) {
                const body = document.createElement('span');
                body.className = 'door-text';
                body.textContent = door.text;
                btn.appendChild(body);
            }

            // Nome del bambino sul davanti della porta, finché la porta è chiusa (non sulle porte di testo)
            if (door.child_name && !opened.has(door.day) && !isText) {
                const name = document.createElement('span');
                name.className = 'child-name';
                name.textContent = door.child_name;
                btn.appendChild(name);
            }

            // Le porte di testo restano sempre attive, non sono bloccate dalla data
            if (state === 'locked' && !isText) {
                btn.classList.add('locked');
                btn.setAttribute('aria-disabled', 'true');
            }
            if (state === 'today') btn.classList.add('today');
            if (opened.has(door.day)) btn.classList.add('open', 'shutters-open');

            btn.addEventListener('click', () => {
                const wasOpen = opened.has(door.day);
                opened.add(door.day);
                saveOpened(opened);
                btn.classList.add('open', 'shutters-open');
                if (!wasOpen && !reducedMotion) {
                    btn.classList.add('just-opened');
                    btn.addEventListener('animationend', () => btn.classList.remove('just-opened'), { once: true });
                }
                openModal(door);
            });

            container.appendChild(btn);
        });
    }

    // Telefono: porta il carosello sulla porta di oggi (prima di dicembre la 1, dopo Natale la 25)
    function scrollToDoor(index, behavior) {
        const container = document.getElementById('doors');
        const door = container.children[index];
        if (!door) return;
        container.scrollTo({
            left: door.offsetLeft - (container.clientWidth - door.offsetWidth) / 2,
            behavior: reducedMotion ? 'auto' : behavior
        });
    }

    function scrollToToday(today, behavior) {
        if (!window.matchMedia('(max-width: 639px)').matches) return;
        const inDecember = today.year === YEAR && today.month === MONTH;
        const afterDecember = today.year > YEAR || (today.year === YEAR && today.month > MONTH);
        const index = inDecember ? Math.min(today.day, 25) - 1 : (afterDecember ? 24 : 0);
        scrollToDoor(index, behavior);
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

    // Carosello: gli stessi disegni che si vedono in griglia (porte con immagine, non di testo),
    // più le porte senza immagine ancora da inserire, come segnaposto non cliccabile
    function renderCarousel() {
        const track = document.getElementById('carousel-track');
        doors.filter(d => d.disegno && !d.text).forEach(door => {
            const slide = document.createElement('button');
            slide.type = 'button';
            slide.className = 'slide';
            slide.dataset.day = door.day;
            slide.setAttribute('aria-label', `Scegli il disegno della porta ${door.day}`);

            const img = document.createElement('img');
            // Stessa immagine che si vede in griglia (la miniatura, se c'è)
            img.src = door.miniatura || door.disegno;
            img.alt = `Disegno della porta ${door.day}`;
            img.loading = 'lazy';
            img.onerror = () => { if (img.src !== door.disegno) img.src = door.disegno; };
            slide.appendChild(img);

            const label = document.createElement('span');
            label.className = 'slide-label';
            label.textContent = `Porta ${door.day}`;
            slide.appendChild(label);

            slide.addEventListener('click', () => openZoom(door));
            track.appendChild(slide);
        });
        // Porte senza ancora un disegno: segnaposto, non si può scegliere
        doors.filter(d => !d.disegno && !d.text).forEach(door => {
            const slide = document.createElement('div');
            slide.className = 'slide placeholder';
            slide.dataset.day = door.day;
            slide.setAttribute('aria-disabled', 'true');
            slide.innerHTML = '<span class="placeholder-num"></span><span class="slide-label"></span>';
            slide.querySelector('.placeholder-num').textContent = door.day;
            slide.querySelector('.slide-label').textContent = `Porta ${door.day} · in arrivo`;
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

    // Ingrandimento del disegno dal carosello: si sceglie con il tasto dentro la finestra
    let zoomDay = null;
    function openZoom(door) {
        zoomDay = door.day;
        document.getElementById('zoom-img').src = door.miniatura || door.disegno;
        document.getElementById('zoom-img').alt = `Disegno della porta ${door.day}`;
        document.getElementById('zoom-label').textContent = `Porta ${door.day}`;
        document.getElementById('zoom').hidden = false;
        document.getElementById('zoom-choose').focus();
    }
    function closeZoom() {
        document.getElementById('zoom').hidden = true;
    }

    // Sceglie un disegno: aggiorna la scritta e l'anteprima nel modulo
    function selectDay(day) {
        selectedDay = day;
        const door = doors.find(d => d.day === day);
        document.getElementById('selected-label').textContent = `Porta ${day}`;
        const preview = document.getElementById('gift-preview');
        preview.src = door ? (door.miniatura || door.disegno) : '';
        document.querySelectorAll('.slide').forEach(s => {
            s.classList.toggle('selected', Number(s.dataset.day) === day);
        });
        // Il disegno scelto va al centro del carosello (scorre solo il carosello, non la pagina)
        const track = document.getElementById('carousel-track');
        const slide = track.querySelector(`.slide[data-day="${day}"]`);
        if (slide) {
            const offset = slide.getBoundingClientRect().left - track.getBoundingClientRect().left;
            const left = track.scrollLeft + offset - (track.clientWidth - slide.offsetWidth) / 2;
            track.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
        }
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
        document.getElementById('zoom-close').addEventListener('click', closeZoom);
        document.getElementById('zoom').addEventListener('click', (e) => {
            if (e.target.id === 'zoom') closeZoom();
        });
        document.getElementById('zoom-choose').addEventListener('click', () => {
            selectDay(zoomDay);
            closeZoom();
        });
        document.getElementById('flip-toggle').addEventListener('click', (e) => {
            const modal = document.getElementById('modal');
            // Porta di testo: il retro è un altro testo, nella stessa finestra
            if (modal.classList.contains('textview')) {
                const toBack = modal.dataset.face !== 'back';
                modal.dataset.face = toBack ? 'back' : 'front';
                document.getElementById('modal-text').textContent = toBack ? modal.dataset.back : modal.dataset.front;
                e.currentTarget.textContent = toBack ? 'Torna al davanti' : e.currentTarget.dataset.idle;
                e.currentTarget.setAttribute('aria-pressed', String(toBack));
                return;
            }
            const flipped = document.getElementById('flip-card').classList.toggle('flipped');
            e.currentTarget.textContent = flipped ? 'Torna al disegno' : e.currentTarget.dataset.idle;
            e.currentTarget.setAttribute('aria-pressed', String(flipped));
        });
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target.id === 'modal') closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { closeModal(); closeZoom(); }
        });

        setupGiftForm();
        // Il nome di chi riceve compare nel retro, mentre si scrive
        document.getElementById('gift-recipient-name').addEventListener('input', (e) => {
            document.getElementById('gift-back-name').textContent = e.target.value.trim() || 'nome';
        });

        try {
            const response = await fetch('/data/avvento.json?v=2026-10-16q');
            const data = await response.json();
            doors = data.doors;
            renderDoors(today);
            scrollToToday(today, 'auto');
            document.getElementById('go-today').addEventListener('click', () => scrollToToday(today, 'smooth'));
            // Con la vendita spenta (contenuti non ancora pronti) si nascondono carosello e modulo
            // Anteprima (?anteprima=1): mostra carosello e modulo; il pagamento resta bloccato dal server
            const anteprima = new URLSearchParams(window.location.search).get('anteprima') === '1';
            if (data.vendita_attiva !== true && !anteprima) {
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
