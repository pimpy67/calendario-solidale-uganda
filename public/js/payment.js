/**
 * Payment.js - Gestione del popup di pagamento e integrazione Satispay
 */

const Payment = (function() {
    // Stato corrente
    let selectedDate = null;
    let isProcessing = false;

    // Elementi DOM
    let modal;
    let closeBtn;
    let selectedDateEl;
    let donorNameInput;
    let isAnonymousCheckbox;
    let payWithSatispayBtn;

    /**
     * Inizializza il modulo pagamento
     */
    function init() {
        // Recupera elementi DOM
        modal = document.getElementById('paymentModal');
        closeBtn = document.getElementById('closeModal');
        selectedDateEl = document.getElementById('selectedDate');
        donorNameInput = document.getElementById('donorName');
        isAnonymousCheckbox = document.getElementById('isAnonymous');
        payWithSatispayBtn = document.getElementById('payWithSatispay');

        // Event listeners
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Checkbox anonimo disabilita campo nome
        isAnonymousCheckbox.addEventListener('change', () => {
            donorNameInput.disabled = isAnonymousCheckbox.checked;
            if (isAnonymousCheckbox.checked) {
                donorNameInput.value = '';
            }
        });

        // Pulsante Satispay
        payWithSatispayBtn.addEventListener('click', handleSatispayPayment);

        // ESC per chiudere
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeModal();
            }
        });
    }

    /**
     * Apre il modal di pagamento
     */
    function openModal(day, month, year) {
        selectedDate = { day, month, year };

        // Formatta data
        const monthName = Calendar.MONTHS[month - 1];
        selectedDateEl.textContent = `${day} ${monthName} ${year}`;

        // Reset form
        donorNameInput.value = '';
        donorNameInput.disabled = false;
        isAnonymousCheckbox.checked = false;
        isProcessing = false;
        payWithSatispayBtn.classList.remove('loading');

        // Mostra modal
        modal.classList.add('active');
        donorNameInput.focus();
    }

    /**
     * Chiude il modal
     */
    function closeModal() {
        if (isProcessing) return; // Non chiudere durante il pagamento

        modal.classList.remove('active');
        selectedDate = null;
    }

    /**
     * Gestisce il pagamento Satispay
     */
    async function handleSatispayPayment() {
        if (isProcessing) return;

        // Valida input
        const isAnonymous = isAnonymousCheckbox.checked;
        const donorName = donorNameInput.value.trim();

        if (!isAnonymous && !donorName) {
            alert('Inserisci il tuo nome oppure seleziona "Preferisco restare anonimo"');
            donorNameInput.focus();
            return;
        }

        // Inizia processing
        isProcessing = true;
        payWithSatispayBtn.classList.add('loading');

        try {
            // Crea donazione sul server
            const response = await fetch('/api/donations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    day: selectedDate.day,
                    month: selectedDate.month,
                    year: selectedDate.year,
                    donor_name: isAnonymous ? null : donorName,
                    is_anonymous: isAnonymous
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Errore nella creazione della donazione');
            }

            const data = await response.json();

            // Se c'e un URL Satispay, redirect
            if (data.satispay_url) {
                window.location.href = data.satispay_url;
            } else {
                // Per test senza Satispay - simula successo
                simulatePaymentSuccess(data.id);
            }

        } catch (error) {
            console.error('Errore pagamento:', error);
            alert(`Errore: ${error.message}`);
            isProcessing = false;
            payWithSatispayBtn.classList.remove('loading');
        }
    }

    /**
     * Simula un pagamento completato (per test)
     */
    async function simulatePaymentSuccess(donationId) {
        try {
            // Conferma il pagamento sul server
            const response = await fetch(`/api/donations/${donationId}/confirm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                // Aggiorna calendario
                const isAnonymous = isAnonymousCheckbox.checked;
                const donorName = isAnonymous ? 'ADOTTATO' : donorNameInput.value.trim();

                Calendar.addDonation(
                    selectedDate.day,
                    selectedDate.month,
                    selectedDate.year,
                    donorName,
                    'completed'
                );

                // Mostra messaggio successo
                showSuccessMessage();
                closeModal();
            } else {
                throw new Error('Errore conferma pagamento');
            }

        } catch (error) {
            console.error('Errore conferma:', error);
            alert('Errore nella conferma del pagamento');
        } finally {
            isProcessing = false;
            payWithSatispayBtn.classList.remove('loading');
        }
    }

    /**
     * Mostra messaggio di successo
     */
    function showSuccessMessage() {
        const monthName = Calendar.MONTHS[selectedDate.month - 1];
        alert(`Grazie per la tua donazione!\n\nHai adottato il ${selectedDate.day} ${monthName} ${selectedDate.year}.\n\nLa Casa Famiglia in Uganda ti ringrazia di cuore!`);
    }

    /**
     * Chiamato quando un pagamento e confermato via webhook
     */
    function onPaymentConfirmed(donationData) {
        Calendar.refresh();
    }

    // API pubblica
    return {
        init,
        openModal,
        closeModal,
        onPaymentConfirmed
    };
})();
