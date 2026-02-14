/**
 * Payment.js - Gestione del popup di pagamento e integrazione Satispay
 */

const Payment = (function() {
    // Stato corrente
    let selectedDate = null;
    let isProcessing = false;
    let selectedCard = 'card1';

    // Elementi DOM
    let modal;
    let closeBtn;
    let selectedDateEl;
    let donorNameInput;
    let isAnonymousCheckbox;
    let isGiftCheckbox;
    let giftSection;
    let giftRecipientNameInput;
    let giftEmailInput;
    let giftMessageInput;
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
        isGiftCheckbox = document.getElementById('isGift');
        giftSection = document.getElementById('giftSection');
        giftRecipientNameInput = document.getElementById('giftRecipientName');
        giftEmailInput = document.getElementById('giftEmail');
        giftMessageInput = document.getElementById('giftMessage');
        payWithSatispayBtn = document.getElementById('payWithSatispay');

        // Event listeners
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
        });
        
        // Backup listeners per mobile/touchscreen
        closeBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
        });
        
        closeBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
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

        // Checkbox regalo mostra/nasconde sezione gift
        isGiftCheckbox.addEventListener('change', () => {
            giftSection.classList.toggle('active', isGiftCheckbox.checked);
            if (!isGiftCheckbox.checked) {
                giftRecipientNameInput.value = '';
                giftEmailInput.value = '';
                giftMessageInput.value = '';
            }
        });

        // Selettore gift card
        const giftcardSelector = document.getElementById('giftcardSelector');
        if (giftcardSelector) {
            giftcardSelector.addEventListener('click', (e) => {
                const option = e.target.closest('.giftcard-option');
                if (!option) return;
                giftcardSelector.querySelectorAll('.giftcard-option').forEach(el => el.classList.remove('selected'));
                option.classList.add('selected');
                selectedCard = option.dataset.card;
            });
        }

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
        isGiftCheckbox.checked = false;
        giftSection.classList.remove('active');
        giftRecipientNameInput.value = '';
        giftEmailInput.value = '';
        giftMessageInput.value = '';
        selectedCard = 'card1';
        const giftcardOptions = document.querySelectorAll('.giftcard-option');
        giftcardOptions.forEach((el, i) => el.classList.toggle('selected', i === 0));
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
        console.log('Modal chiuso');
    }

    /**
     * Gestisce il pagamento Satispay
     */
    async function handleSatispayPayment() {
        if (isProcessing) return;

        // Valida input
        const isAnonymous = isAnonymousCheckbox.checked;
        const donorName = donorNameInput.value.trim();
        const isGift = isGiftCheckbox.checked;

        if (!isAnonymous && !donorName) {
            alert('Inserisci il tuo nome oppure seleziona "Preferisco restare anonimo"');
            donorNameInput.focus();
            return;
        }

        // Valida campi regalo
        if (isGift) {
            const giftEmail = giftEmailInput.value.trim();
            const giftRecipientName = giftRecipientNameInput.value.trim();
            if (!giftEmail) {
                alert('Inserisci l\'email del destinatario del regalo');
                giftEmailInput.focus();
                return;
            }
            if (!giftRecipientName) {
                alert('Inserisci il nome del destinatario del regalo');
                giftRecipientNameInput.focus();
                return;
            }
        }

        // Inizia processing
        isProcessing = true;
        payWithSatispayBtn.classList.add('loading');

        try {
            // Prepara dati
            const donationData = {
                day: selectedDate.day,
                month: selectedDate.month,
                year: selectedDate.year,
                donor_name: isAnonymous ? null : donorName,
                is_anonymous: isAnonymous
            };

            // Aggiungi dati regalo se attivo
            if (isGift) {
                donationData.is_gift = true;
                donationData.gift_email = giftEmailInput.value.trim();
                donationData.gift_recipient_name = giftRecipientNameInput.value.trim();
                donationData.gift_message = giftMessageInput.value.trim();
                donationData.gift_card_design = selectedCard;
            }

            // Crea donazione sul server
            const response = await fetch('/api/donations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(donationData)
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
        let message = `Grazie per la tua donazione!\n\nHai adottato il ${selectedDate.day} ${monthName} ${selectedDate.year}.\n\nLa Casa Famiglia in Uganda ti ringrazia di cuore!`;

        if (isGiftCheckbox.checked) {
            message += `\n\nUna gift card verra inviata a ${giftEmailInput.value.trim()}!`;
        }

        alert(message);
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
