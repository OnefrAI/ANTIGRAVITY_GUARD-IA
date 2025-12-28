// Import necessary functions from the Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadString,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAf3I3_aW__lBtTVlEJ9xesIWkEJ6lMJp8",
    authDomain: "guard-ia-a36da.firebaseapp.com",
    projectId: "guard-ia-a36da",
    storageBucket: "guard-ia-a36da.appspot.com",
    messagingSenderId: "914018061004",
    appId: "1:914018061004:web:6ab6c6ca728199033bd069",
    measurementId: "G-W45Z1BH3T4"
};

// Initialize Firebase Services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ===== DOM ELEMENTS - SOLO ESENCIALES =====
const authStateDiv = document.getElementById('auth-state');
const appContentDiv = document.getElementById('app-content');
const userInfoDiv = document.getElementById('user-info');

// Variables que se inicializarán después
let noteForm, notesContainer, saveNoteButton;
let formTitle, cancelEditButton;
let searchInput, tagFilter, tagsDropdownInput, tagsDropdownOptions;
let selectedTagsDisplay;
let quill = null;

// Tag color map
const tagColorMap = {
    "Servicio de Sala": "tag-servicio-de-sala",
    "A requerimiento": "tag-a-requerimiento",
    "Por superioridad": "tag-por-superioridad",
    "Otros": "tag-otros"
};

// Global state
let selectedTags = [];
let currentUserId = null;
let unsubscribeFromNotes = null;
let allNotes = [];
let isEditing = false;
let currentEditingNoteId = null;

// ===== AUTHENTICATION =====
onAuthStateChanged(auth, (user) => {
    console.log('🔐 Estado de autenticación:', user ? 'Usuario conectado' : 'Sin usuario');

    if (user) {
        currentUserId = user.uid;
        console.log('✅ Usuario ID:', currentUserId);

        authStateDiv.classList.add('hidden');
        appContentDiv.classList.remove('hidden');

        setTimeout(() => {
            console.log('⏳ Inicializando aplicación...');
            initializeDOMElements();
            setupUserInterface(user);
            listenForNotes();
            console.log('✅ Aplicación inicializada correctamente');
        }, 200);

    } else {
        console.log('❌ Usuario no autenticado');
        handleLogout();
    }
});

// ===== INICIALIZAR ELEMENTOS DEL DOM =====
function initializeDOMElements() {
    console.log('🔄 Capturando elementos del DOM...');

    noteForm = document.getElementById('noteForm');
    notesContainer = document.getElementById('notesContainer');
    saveNoteButton = document.getElementById('saveNoteButton');
    formTitle = document.getElementById('formTitle');
    cancelEditButton = document.getElementById('cancelEditButton');
    searchInput = document.getElementById('searchInput');
    tagFilter = document.getElementById('tagFilter');
    tagsDropdownInput = document.getElementById('tagsDropdownInput');
    tagsDropdownOptions = document.getElementById('tagsDropdownOptions');
    selectedTagsDisplay = document.getElementById('selectedTagsDisplay');

    if (!noteForm) {
        console.error('❌ Error: No se encontraron los elementos del formulario');
        return;
    }

    initializeQuillEditor();
    attachEventListeners();

    console.log('✅ Elementos DOM capturados correctamente');
}

// ===== INICIALIZAR QUILL EDITOR =====
function initializeQuillEditor() {
    // Verificar si Quill ya está cargado
    if (typeof Quill === 'undefined') {
        console.log('⏳ Esperando a que Quill cargue...');
        // Reintentar en 500ms, máximo 10 intentos
        if (!window._quillRetryCount) window._quillRetryCount = 0;
        if (window._quillRetryCount < 10) {
            window._quillRetryCount++;
            setTimeout(initializeQuillEditor, 500);
        } else {
            console.error('❌ Error: Quill no se pudo cargar después de 10 intentos');
            showToast("Error cargando el editor. Recarga la página.", 'error');
        }
        return;
    }

    if (!quill) {
        const editorContainer = document.getElementById('editor-container');
        if (editorContainer) {
            quill = new Quill('#editor-container', {
                modules: {
                    toolbar: false
                },
                theme: 'snow',
                placeholder: 'Escribe aquí los hechos y detalles de la intervención...',
            });
            console.log('✅ Quill Editor inicializado');
        }
    }
}

// ===== CONFIGURAR INTERFAZ DE USUARIO =====
function setupUserInterface(user) {
    userInfoDiv.innerHTML = `
        <div class="user-info-container">
            <span class="user-email">${user.email}</span>
            <button id="logoutButton" class="logout-btn">
                <i class="fas fa-sign-out-alt"></i>
                <span>Salir</span>
            </button>
        </div>
    `;

    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            console.log('🚪 Cerrando sesión...');
            signOut(auth).catch(error => {
                console.error("Error al cerrar sesión:", error);
                showToast("Error al cerrar sesión", 'error');
            });
        });
    }
}

// ===== MANEJAR CIERRE DE SESIÓN =====
function handleLogout() {
    currentUserId = null;
    appContentDiv.classList.add('hidden');
    authStateDiv.classList.remove('hidden');
    authStateDiv.innerHTML = `
        <p><i class="fas fa-exclamation-triangle"></i> Debes iniciar sesión para usar el bloc de notas.</p>
        <p><a href="../../index.html">Volver para iniciar sesión</a></p>
    `;
    userInfoDiv.innerHTML = '';
    if (unsubscribeFromNotes) unsubscribeFromNotes();
    allNotes = [];
}

// ===== ADJUNTAR EVENT LISTENERS =====
function attachEventListeners() {
    console.log('🔄 Adjuntando event listeners...');

    noteForm.addEventListener('submit', handleFormSubmit);
    cancelEditButton.addEventListener('click', resetForm);
    searchInput.addEventListener('input', applyFilters);
    tagFilter.addEventListener('change', applyFilters);
    tagsDropdownInput.addEventListener('click', handleDropdownToggle);
    tagsDropdownOptions.addEventListener('click', handleDropdownSelection);
    document.addEventListener('click', handleOutsideDropdownClick);

    console.log('✅ Event listeners adjuntados correctamente');
}

// ===== FORM SUBMIT HANDLER =====
async function handleFormSubmit(e) {
    e.preventDefault();
    saveNoteButton.disabled = true;
    saveNoteButton.querySelector('span').textContent = isEditing ? 'Actualizando...' : 'Guardando...';

    try {
        // Verificar que quill esté disponible
        if (!quill) {
            console.error('Error: Quill editor no está inicializado');
            showToast("Error: Editor no disponible. Recarga la página.", 'error');
            return;
        }

        const noteData = {
            interventionLocation: document.getElementById('interventionLocation').value,
            documentNumber: document.getElementById('documentNumber').value,
            fullName: document.getElementById('fullName').value,
            birthPlace: document.getElementById('birthPlace').value,
            birthdate: document.getElementById('birthdate').value,
            parentsName: document.getElementById('parentsName').value,
            address: document.getElementById('address').value,
            vehicleBrand: document.getElementById('vehicleBrand').value,
            licensePlate: document.getElementById('licensePlate').value,
            phone: document.getElementById('phone').value,
            factsHtml: quill.root.innerHTML,
            factsText: quill.getText(),
            tags: selectedTags,
        };

        // Cargar notas existentes de localStorage
        const storageKey = `guardia_notes_${currentUserId}`;
        let notes = JSON.parse(localStorage.getItem(storageKey) || '[]');

        if (isEditing) {
            // Actualizar nota existente
            const index = notes.findIndex(n => n.id === currentEditingNoteId);
            if (index !== -1) {
                notes[index] = { ...notes[index], ...noteData };
            }
            showToast("Nota actualizada exitosamente");
        } else {
            // Crear nota nueva
            noteData.id = 'note_' + Date.now();
            noteData.createdAt = new Date().toISOString();
            notes.unshift(noteData);
            showToast("Nota guardada localmente");
        }

        // Guardar en localStorage
        localStorage.setItem(storageKey, JSON.stringify(notes));

        // Recargar notas
        loadNotesFromLocalStorage();
        resetForm();
    } catch (error) {
        console.error("Error durante el guardado/actualización:", error);
        showToast("Hubo un error al guardar la nota", 'error');
    } finally {
        saveNoteButton.disabled = false;
        saveNoteButton.querySelector('span').textContent = isEditing ? 'Actualizar Nota' : 'Guardar Nota';
    }
}

// ===== LOCALSTORAGE LOGIC =====
function listenForNotes() {
    if (!currentUserId || !notesContainer) return;
    loadNotesFromLocalStorage();
}

function loadNotesFromLocalStorage() {
    if (!notesContainer) return;

    const storageKey = `guardia_notes_${currentUserId}`;
    const notes = JSON.parse(localStorage.getItem(storageKey) || '[]');

    allNotes = notes;
    // Ordenar por fecha (más recientes primero)
    allNotes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    populateTagFilter();
    applyFilters();
}

// ===== SHARE NOTE =====
window.shareNote = async function (noteId) {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;

    const noteText = formatNoteForSharing(note);
    showShareModal(noteText);
};

function formatNoteForSharing(note) {
    const timestamp = note.createdAt
        ? new Date(note.createdAt).toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : 'N/A';

    const tags = note.tags && note.tags.length > 0
        ? `\n🏷️ Etiquetas: ${note.tags.join(', ')}`
        : '';

    return `📋 NOTA DE INTERVENCIÓN
━━━━━━━━━━━━━━━━━━━━━━

⏰ Fecha y Hora: ${timestamp}
📍 Lugar: ${note.interventionLocation || 'N/A'}
🆔 Documento: ${note.documentNumber || 'N/A'}
👤 Nombre: ${note.fullName || 'N/A'}
🌍 Lugar de Nacimiento: ${note.birthPlace || 'N/A'}
📅 Fecha de Nacimiento: ${note.birthdate || 'N/A'}
📞 Teléfono: ${note.phone || 'N/A'}
👨‍👩‍👧 Padres: ${note.parentsName || 'N/A'}
🏠 Dirección: ${note.address || 'N/A'}
🚗 Vehículo: ${note.vehicleBrand || 'N/A'}
🔢 Matrícula: ${note.licensePlate || 'N/A'}

📝 HECHOS:
${note.factsText || 'N/A'}${tags}

━━━━━━━━━━━━━━━━━━━━━━
Generado por GUARD-IA`.trim();
}

function showShareModal(noteText) {
    const existingModal = document.querySelector('.share-modal-overlay');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.className = 'share-modal-overlay active';
    overlay.innerHTML = `
        <div class="share-modal-content">
            <h3><i class="fas fa-share-alt"></i> Compartir Nota</h3>
            <p>Elige cómo quieres compartir esta nota:</p>
            <div class="share-buttons">
                <button class="share-btn copy-btn">
                    <i class="fas fa-copy"></i>
                    <span>Copiar</span>
                </button>
                <button class="share-btn whatsapp-btn">
                    <i class="fab fa-whatsapp"></i>
                    <span>WhatsApp</span>
                </button>
            </div>
            <button class="share-btn cancel-share-btn">
                <i class="fas fa-times"></i> Cancelar
            </button>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.copy-btn').onclick = () => {
        copyToClipboard(noteText);
        overlay.remove();
    };

    overlay.querySelector('.whatsapp-btn').onclick = () => {
        shareViaWhatsApp(noteText);
        overlay.remove();
    };

    overlay.querySelector('.cancel-share-btn').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Nota copiada al portapapeles');
    } catch (err) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('Nota copiada al portapapeles');
        } catch (e) {
            showToast('No se pudo copiar la nota', 'error');
        }
        document.body.removeChild(textArea);
    }
}

function shareViaWhatsApp(text) {
    const encodedText = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/?text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
    showToast('Abriendo WhatsApp...');
}

// ===== DELETE NOTE =====
window.deleteNote = async function (noteId) {
    if (!currentUserId || !noteId) return;

    const confirmed = await createConfirmationModal(
        "¿Estás seguro de eliminar esta nota? Esta acción no se puede deshacer."
    );

    if (!confirmed) return;

    try {
        const storageKey = `guardia_notes_${currentUserId}`;
        let notes = JSON.parse(localStorage.getItem(storageKey) || '[]');
        notes = notes.filter(n => n.id !== noteId);
        localStorage.setItem(storageKey, JSON.stringify(notes));
        loadNotesFromLocalStorage();
        showToast("Nota eliminada correctamente");
    } catch (error) {
        console.error("Error al eliminar nota:", error);
        showToast("Hubo un error al eliminar la nota", 'error');
    }
};

// ===== EDIT LOGIC =====
window.startEditNote = (noteId) => {
    const noteToEdit = allNotes.find(note => note.id === noteId);
    if (!noteToEdit) return;

    isEditing = true;
    currentEditingNoteId = noteId;

    document.getElementById('interventionLocation').value = noteToEdit.interventionLocation || '';
    document.getElementById('documentNumber').value = noteToEdit.documentNumber || '';
    document.getElementById('fullName').value = noteToEdit.fullName || '';
    document.getElementById('birthPlace').value = noteToEdit.birthPlace || '';
    document.getElementById('birthdate').value = noteToEdit.birthdate || '';
    document.getElementById('parentsName').value = noteToEdit.parentsName || '';
    document.getElementById('address').value = noteToEdit.address || '';
    document.getElementById('vehicleBrand').value = noteToEdit.vehicleBrand || '';
    document.getElementById('licensePlate').value = noteToEdit.licensePlate || '';
    document.getElementById('phone').value = noteToEdit.phone || '';
    quill.root.innerHTML = noteToEdit.factsHtml || '';
    selectedTags = noteToEdit.tags || [];
    renderSelectedTags();

    formTitle.textContent = "Editando Nota";
    saveNoteButton.querySelector('span').textContent = "Actualizar Nota";
    cancelEditButton.classList.remove('hidden');

    noteForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function resetForm() {
    noteForm.reset();
    quill.setText('');
    selectedTags = [];
    renderSelectedTags();
    isEditing = false;
    currentEditingNoteId = null;
    formTitle.textContent = "Crear Nueva Nota";
    saveNoteButton.querySelector('span').textContent = 'Guardar Nota';
    cancelEditButton.classList.add('hidden');
}

// ===== SEARCH & FILTER =====
function applyFilters() {
    if (!searchInput || !tagFilter) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const tagToFilter = tagFilter.value;
    let filteredNotes = allNotes;

    if (searchTerm) {
        filteredNotes = filteredNotes.filter(note =>
            Object.values(note).some(value =>
                String(value).toLowerCase().includes(searchTerm)
            )
        );
    }

    if (tagToFilter) {
        filteredNotes = filteredNotes.filter(note =>
            note.tags && note.tags.includes(tagToFilter)
        );
    }

    displayNotes(filteredNotes);
}

function populateTagFilter() {
    if (!tagFilter) return;

    const allTags = new Set(allNotes.flatMap(note => note.tags || []));
    const currentFilterValue = tagFilter.value;

    tagFilter.innerHTML = '<option value="">Todas las etiquetas</option>';
    allTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        tagFilter.appendChild(option);
    });

    tagFilter.value = currentFilterValue;
}

// ===== DISPLAY NOTES =====
function displayNotes(notesToShow) {
    if (!notesContainer) return;

    if (!notesToShow || notesToShow.length === 0) {
        notesContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-medium-color);">
                <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p style="font-size: 1.125rem;">No hay notas que coincidan con tu búsqueda</p>
            </div>
        `;
        return;
    }

    notesContainer.innerHTML = notesToShow.map(note => {
        // Manejar ambos formatos: Firestore Timestamp y ISO string
        let displayTimestamp = 'N/A';
        if (note.createdAt) {
            const date = note.createdAt.toDate ? note.createdAt.toDate() : new Date(note.createdAt);
            displayTimestamp = date.toLocaleString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        const tagsHtml = (note.tags && note.tags.length > 0)
            ? `<div class="note-tags">${note.tags.map(tag =>
                `<span class="note-tag ${tagColorMap[tag] || ''}">${tag}</span>`
            ).join('')}</div>`
            : '';

        return `
        <div class="note">
            <p><strong><i class="fas fa-clock"></i> Fecha y Hora:</strong> ${displayTimestamp}</p>
            <p><strong><i class="fas fa-map-marker-alt"></i> Lugar de Intervención:</strong> ${note.interventionLocation || 'N/A'}</p>
            <p><strong><i class="fas fa-id-card"></i> Documento:</strong> ${note.documentNumber || 'N/A'}</p>
            <p><strong><i class="fas fa-user"></i> Nombre:</strong> ${note.fullName || 'N/A'}</p>
            <p><strong><i class="fas fa-globe"></i> Lugar de Nacimiento:</strong> ${note.birthPlace || 'N/A'}</p>
            <p><strong><i class="fas fa-calendar"></i> Fecha de Nacimiento:</strong> ${note.birthdate || 'N/A'}</p>
            <p><strong><i class="fas fa-phone"></i> Teléfono:</strong> ${note.phone || 'N/A'}</p>
            <p><strong><i class="fas fa-users"></i> Padres:</strong> ${note.parentsName || 'N/A'}</p>
            <p><strong><i class="fas fa-home"></i> Dirección:</strong> ${note.address || 'N/A'}</p>
            <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${note.vehicleBrand || 'N/A'}</p>
            <p><strong><i class="fas fa-id-badge"></i> Matrícula:</strong> ${note.licensePlate || 'N/A'}</p>
            <p><strong><i class="fas fa-pen"></i> Hechos:</strong></p>
            <div class="ql-editor-readonly">${note.factsHtml || 'N/A'}</div>
            ${tagsHtml}
            <div class="note-actions">
                <button class="btn btn-edit" onclick="window.startEditNote('${note.id}')">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="btn btn-share" onclick="window.shareNote('${note.id}')">
                    <i class="fas fa-share-alt"></i> Compartir
                </button>
                <button class="btn btn-delete" onclick="window.deleteNote('${note.id}')">
                    <i class="fas fa-trash"></i> Eliminar
                </button>               
            </div>
        </div>`;
    }).join('');
}

// ===== TAGS DROPDOWN HANDLERS =====
function handleDropdownToggle(e) {
    e.stopPropagation();
    tagsDropdownOptions.classList.toggle('active');
}

function handleDropdownSelection(e) {
    if (e.target.classList.contains('dropdown-option')) {
        const tagValue = e.target.dataset.value;
        if (!selectedTags.includes(tagValue)) {
            selectedTags.push(tagValue);
            renderSelectedTags();
        }
        tagsDropdownOptions.classList.remove('active');
    }
}

function handleOutsideDropdownClick(e) {
    if (tagsDropdownInput && tagsDropdownOptions &&
        !tagsDropdownInput.contains(e.target) &&
        !tagsDropdownOptions.contains(e.target)) {
        tagsDropdownOptions.classList.remove('active');
    }
}

function renderSelectedTags() {
    if (!selectedTagsDisplay) return;

    selectedTagsDisplay.innerHTML = '';
    selectedTags.forEach(tag => {
        const tagItem = document.createElement('span');
        tagItem.className = `selected-tag-item ${tagColorMap[tag] || ''}`;
        tagItem.innerHTML = `
            ${tag} 
            <i class="fas fa-times-circle remove-tag-icon" data-tag="${tag}"></i>
        `;
        tagItem.querySelector('.remove-tag-icon').addEventListener('click', (e) => {
            e.stopPropagation();
            removeTag(e.target.dataset.tag);
        });
        selectedTagsDisplay.appendChild(tagItem);
    });
}

function removeTag(tagToRemove) {
    selectedTags = selectedTags.filter(tag => tag !== tagToRemove);
    renderSelectedTags();
}

// ===== UTILITY FUNCTIONS =====
function showToast(message, type = 'success') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;

    const icon = type === 'success'
        ? '<i class="fas fa-check-circle"></i>'
        : '<i class="fas fa-exclamation-circle"></i>';

    toast.innerHTML = `${icon} <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 500);
    }, 3000);
}

function createConfirmationModal(message) {
    const existingModal = document.querySelector('.custom-modal-overlay');
    if (existingModal) {
        existingModal.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay active';
    overlay.innerHTML = `
        <div class="custom-modal-content">
            <h3><i class="fas fa-exclamation-triangle"></i> Confirmación</h3>
            <p>${message}</p>
            <div class="custom-modal-buttons">
                <button class="custom-modal-btn confirm">
                    <i class="fas fa-check"></i> Confirmar
                </button>
                <button class="custom-modal-btn cancel">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    return new Promise(resolve => {
        overlay.querySelector('.custom-modal-btn.confirm').onclick = () => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
            resolve(true);
        };

        overlay.querySelector('.custom-modal-btn.cancel').onclick = () => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
            resolve(false);
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                resolve(false);
            }
        });
    });
}