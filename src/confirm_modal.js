import { toggleModal } from './modal-handler';

export function showConfirm({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    return new Promise((resolve, reject) => {
        const confirm_modal = document.getElementById('confirm-modal');
        if (!confirm_modal) { resolve(false); return; }
        const panel = document.getElementById('c-modal-confirm');
        const titleBox = document.getElementById('confirm-modal-title');
        const messageBox = document.getElementById('confirm-modal-message');
        const confirm_box = document.getElementById('confirm-modal-ok');
        const cancel_box = document.getElementById('confirm-modal-cancel');
        titleBox.textContent = title;
        messageBox.textContent = message;
        confirm_box.textContent = confirmText;
        cancel_box.textContent = cancelText;
        panel.classList.toggle('is-danger', danger);
        toggleModal('confirm-modal');
        
        const onConfirm = () => { cleanup(); resolve(true); };
        const onCancel  = () => { cleanup(); resolve(false); }; 

        const cleanup = () => {
          confirm_box.removeEventListener('click', onConfirm);                                                                                                     
          cancel_box.removeEventListener('click', onCancel);                                                                                                     
          toggleModal('confirm-modal');   // close the modal                                                                                                       
        };

        confirm_box.addEventListener('click', onConfirm);                                                                                                            
        cancel_box.addEventListener('click', onCancel);
    });
}


