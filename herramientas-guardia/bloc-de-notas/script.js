// Import necessary functions from the Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    onSnapshot,
    deleteDoc,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadString,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// ===== CRYPTO E2E =====
import { generateSalt, deriveKey, encrypt, decrypt, isEncrypted } from '../shared/crypto-utils.js';

// ===== WEBAUTHN (Biometría) =====
import { isWebAuthnAvailable, hasStoredCredential, registerBiometric, authenticateWithBiometric } from '../shared/webauthn-utils.js';

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

// Variables que se inicializaran despues
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

// ===== E2E ENCRYPTION STATE =====
let userCryptoKey = null;  // Clave AES derivada de la contrasena
let userSalt = null;       // Salt unico del usuario

// ===== AUTHENTICATION =====
onAuthStateChanged(auth, async (user) => {
    console.log('[E2E] Estado de autenticacion:', user ? 'Usuario conectado' : 'Sin usuario');

    if (user) {
        currentUserId = user.uid;
        console.log('[E2E] Usuario ID:', currentUserId);

        // Si no tenemos clave crypto, mostrar modal para pedir contrasena
        if (!userCryptoKey) {
            showCryptoPasswordModal();
            return;
        }

        startApp();
    } else {
        console.log('[E2E] Usuario no autenticado');
        userCryptoKey = null;
        userSalt = null;
        handleLogout();
    }
});

// ===== INICIAR APP TRAS DESBLOQUEO =====
function startApp() {
    authStateDiv.classList.add('hidden');
    appContentDiv.classList.remove('hidden');

    setTimeout(() => {
        console.log('[E2E] Inicializando aplicacion...');
        initializeDOMElements();
        setupUserInterface(auth.currentUser);
        listenForNotes();
        console.log('[E2E] Aplicacion inicializada correctamente');
    }, 200);
}

// ===== CRYPTO INITIALIZATION =====
async function initializeCrypto(password) {
    try {
        console.log('[E2E] Inicializando cifrado E2E...');

        // Obtener o crear salt del usuario
        const cryptoDocRef = doc(db, "users", currentUserId, "settings", "crypto");
        const cryptoDoc = await getDoc(cryptoDocRef);

        if (cryptoDoc.exists()) {
            userSalt = cryptoDoc.data().salt;
            console.log('[E2E] Salt existente recuperado');
        } else {
            // Primer uso: crear salt nuevo
            userSalt = generateSalt();
            await setDoc(cryptoDocRef, { salt: userSalt, createdAt: serverTimestamp() });
            console.log('[E2E] Nuevo salt creado y guardado');
        }

        // Derivar clave AES de la contrasena
        userCryptoKey = await deriveKey(password, userSalt);
        sessionStorage.setItem('guardia_crypto_ready', currentUserId);

        console.log('[E2E] Cifrado E2E inicializado correctamente');
        return true;
    } catch (error) {
        console.error('[E2E] Error inicializando cifrado:', error);
        return false;
    }
}

// Modal para pedir contraseña o biometría
function showCryptoPasswordModal() {
    // Ocultar contenido mientras se pide autenticación
    authStateDiv.classList.remove('hidden');
    appContentDiv.classList.add('hidden');

    const hasBiometric = isWebAuthnAvailable() && hasStoredCredential(currentUserId);

    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay active';
    overlay.id = 'cryptoModal';
    overlay.innerHTML = `
        <div class="custom-modal-content" style="max-width: 420px; background: #1a1a2e; border: 1px solid #2d2d44;">
            <h3 style="color: #22c55e;"><i class="fas fa-lock"></i> Acceso Seguro E2E</h3>
            <p style="margin-bottom: 1rem; color: #a0a0b0;">
                Tus notas están cifradas de extremo a extremo.
            </p>
            <div style="background: #252540; padding: 0.75rem; border-radius: 8px; margin-bottom: 1.25rem; font-size: 0.85rem; color: #c0c0d0;">
                <i class="fas fa-shield-alt" style="color: #22c55e;"></i>
                <strong style="color: #fff;">Cifrado E2E:</strong> Ni siquiera el administrador puede leer tus datos.
            </div>
            
            ${hasBiometric ? `
            <!-- OPCIÓN BIOMÉTRICA -->
            <button id="biometricBtn" class="btn btn-primary" style="width: 100%; padding: 1.25rem; font-size: 1.1rem; margin-bottom: 1rem; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);">
                <i class="fas fa-fingerprint" style="font-size: 1.5rem; margin-right: 0.5rem;"></i> Desbloquear con Huella
            </button>
            <div style="text-align: center; color: #606070; margin-bottom: 1rem; font-size: 0.85rem;">
                <span>─── o usa contraseña ───</span>
            </div>
            ` : ''}
            
            <!-- OPCIÓN CONTRASEÑA -->
            <div id="passwordSection">
                <div style="position: relative; margin-bottom: 1rem;">
                    <input type="password" id="cryptoPassword" 
                           placeholder="Tu contraseña" 
                           style="width: 100%; padding: 1rem 3rem 1rem 1rem; font-size: 1.1rem; 
                                  background: #252540; border: 1px solid #3d3d5c; border-radius: 8px;
                                  color: #fff; outline: none;">
                    <button type="button" id="togglePassword" 
                            style="position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%);
                                   background: none; border: none; color: #808090; cursor: pointer; 
                                   padding: 0.5rem; font-size: 1.1rem;">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
                <p id="cryptoError" style="color: #ef4444; font-size: 0.85rem; display: none; margin-bottom: 1rem;"></p>
                <button id="cryptoSubmit" class="btn btn-primary" style="width: 100%; padding: 1rem; font-size: 1rem;">
                    <i class="fas fa-unlock"></i> Desbloquear con Contraseña
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const passwordInput = document.getElementById('cryptoPassword');
    const submitBtn = document.getElementById('cryptoSubmit');
    const errorMsg = document.getElementById('cryptoError');
    const toggleBtn = document.getElementById('togglePassword');
    const biometricBtn = document.getElementById('biometricBtn');

    // Toggle password visibility
    toggleBtn.onclick = () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        toggleBtn.innerHTML = isPassword ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    };

    // Biometric authentication
    if (biometricBtn) {
        biometricBtn.onclick = async () => {
            biometricBtn.disabled = true;
            biometricBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

            const success = await authenticateWithBiometric(currentUserId);

            if (success) {
                // Obtener clave desde sessionStorage (guardada anteriormente)
                const storedKey = sessionStorage.getItem('guardia_derived_key_' + currentUserId);
                if (storedKey) {
                    userCryptoKey = await importStoredKey(storedKey);
                    overlay.remove();
                    startApp();
                    return;
                }
                // Si no hay clave guardada, pedir contraseña una vez
                errorMsg.textContent = 'Primera vez: introduce contraseña para activar huella';
                errorMsg.style.display = 'block';
                biometricBtn.style.display = 'none';
            } else {
                errorMsg.textContent = 'Biometría fallida. Usa contraseña.';
                errorMsg.style.display = 'block';
                biometricBtn.disabled = false;
                biometricBtn.innerHTML = '<i class="fas fa-fingerprint" style="font-size: 1.5rem; margin-right: 0.5rem;"></i> Desbloquear con Huella';
            }
        };

        // Auto-trigger biometric on load if available
        setTimeout(() => biometricBtn.click(), 300);
    } else {
        passwordInput.focus();
    }

    // Password authentication
    async function handlePasswordSubmit() {
        const password = passwordInput.value;
        if (!password) {
            errorMsg.textContent = 'Introduce tu contraseña';
            errorMsg.style.display = 'block';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Desbloqueando...';

        const success = await initializeCrypto(password);

        if (success) {
            // Guardar clave para biometría futura
            const exportedKey = await exportKeyForStorage(userCryptoKey);
            sessionStorage.setItem('guardia_derived_key_' + currentUserId, exportedKey);

            // Ofrecer registrar biometría si disponible y no registrada
            if (isWebAuthnAvailable() && !hasStoredCredential(currentUserId)) {
                overlay.remove();
                await offerBiometricRegistration();
            } else {
                overlay.remove();
            }
            startApp();
        } else {
            errorMsg.textContent = 'Error al procesar. Verifica tu contraseña.';
            errorMsg.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-unlock"></i> Desbloquear con Contraseña';
        }
    }

    submitBtn.onclick = handlePasswordSubmit;
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handlePasswordSubmit();
    });
}

// Ofrecer registro de biometría
async function offerBiometricRegistration() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay active';
        overlay.innerHTML = `
            <div class="custom-modal-content" style="max-width: 400px; background: #1a1a2e; border: 1px solid #2d2d44; text-align: center;">
                <i class="fas fa-fingerprint" style="font-size: 4rem; color: #22c55e; margin-bottom: 1rem;"></i>
                <h3 style="color: #fff; margin-bottom: 0.5rem;">¿Activar Huella Digital?</h3>
                <p style="color: #a0a0b0; margin-bottom: 1.5rem; font-size: 0.9rem;">
                    La próxima vez podrás desbloquear tus notas con un solo toque.
                </p>
                <button id="enableBiometric" class="btn btn-primary" style="width: 100%; padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);">
                    <i class="fas fa-check"></i> Sí, activar huella
                </button>
                <button id="skipBiometric" style="width: 100%; padding: 0.75rem; background: transparent; border: 1px solid #3d3d5c; color: #808090; border-radius: 8px; cursor: pointer;">
                    Ahora no
                </button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('enableBiometric').onclick = async () => {
            const registered = await registerBiometric(currentUserId, auth.currentUser?.email || 'usuario');
            overlay.remove();
            if (registered) {
                showToast('Huella activada correctamente');
            }
            resolve();
        };

        document.getElementById('skipBiometric').onclick = () => {
            overlay.remove();
            resolve();
        };
    });
}

// Exportar clave para almacenar en sessionStorage
async function exportKeyForStorage(key) {
    const exported = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

// Importar clave desde sessionStorage
async function importStoredKey(storedKey) {
    const keyBytes = Uint8Array.from(atob(storedKey), c => c.charCodeAt(0));
    return await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

// ===== INICIALIZAR ELEMENTOS DEL DOM =====
function initializeDOMElements() {
    console.log('[E2E] Capturando elementos del DOM...');

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
        console.error('[E2E] Error: No se encontraron los elementos del formulario');
        return;
    }

    initializeQuillEditor();
    attachEventListeners();

    console.log('[E2E] Elementos DOM capturados correctamente');
}

// ===== INICIALIZAR QUILL EDITOR =====
function initializeQuillEditor() {
    if (!quill) {
        const editorContainer = document.getElementById('editor-container');
        if (editorContainer) {
            quill = new Quill('#editor-container', {
                modules: {
                    toolbar: false
                },
                theme: 'snow',
                placeholder: 'Escribe aqui los hechos y detalles de la intervencion...',
            });
            console.log('[E2E] Quill Editor inicializado');
        }
    }
}

// ===== CONFIGURAR INTERFAZ DE USUARIO =====
function setupUserInterface(user) {
    userInfoDiv.innerHTML = `
        <div class="user-info-container">
            <span class="user-email"><i class="fas fa-lock" style="color:#22c55e;margin-right:4px;"></i>${user.email}</span>
            <button id="logoutButton" class="logout-btn">
                <i class="fas fa-sign-out-alt"></i>
                <span>Salir</span>
            </button>
        </div>
    `;

    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            console.log('[E2E] Cerrando sesion...');
            userCryptoKey = null;
            userSalt = null;
            sessionStorage.removeItem('guardia_crypto_ready');
            signOut(auth).catch(error => {
                console.error("Error al cerrar sesion:", error);
                showToast("Error al cerrar sesion", 'error');
            });
        });
    }
}

// ===== MANEJAR CIERRE DE SESION =====
function handleLogout() {
    currentUserId = null;
    userCryptoKey = null;
    userSalt = null;
    appContentDiv.classList.add('hidden');
    authStateDiv.classList.remove('hidden');
    authStateDiv.innerHTML = `
        <p><i class="fas fa-exclamation-triangle"></i> Debes iniciar sesion para usar el bloc de notas.</p>
        <p><a href="../../index.html">Volver para iniciar sesion</a></p>
    `;
    userInfoDiv.innerHTML = '';
    if (unsubscribeFromNotes) unsubscribeFromNotes();
    allNotes = [];
}

// ===== ADJUNTAR EVENT LISTENERS =====
function attachEventListeners() {
    console.log('[E2E] Adjuntando event listeners...');

    noteForm.addEventListener('submit', handleFormSubmit);
    cancelEditButton.addEventListener('click', resetForm);
    searchInput.addEventListener('input', applyFilters);
    tagFilter.addEventListener('change', applyFilters);
    tagsDropdownInput.addEventListener('click', handleDropdownToggle);
    tagsDropdownOptions.addEventListener('click', handleDropdownSelection);
    document.addEventListener('click', handleOutsideDropdownClick);

    console.log('[E2E] Event listeners adjuntados correctamente');
}

// ===== FORM SUBMIT HANDLER (E2E ENCRYPTED) =====
async function handleFormSubmit(e) {
    e.preventDefault();
    saveNoteButton.disabled = true;
    saveNoteButton.querySelector('span').textContent = isEditing ? 'Actualizando...' : 'Cifrando...';

    try {
        // Datos sensibles a cifrar (RGPD)
        const sensitiveData = {
            interventionLocation: document.getElementById('interventionLocation').value,
            documentNumber: document.getElementById('documentNumber').value,
            fullName: document.getElementById('fullName').value,
            birthPlace: document.getElementById('birthPlace').value,
            birthdate: document.getElementById('birthdate').value,
            parentsName: document.getElementById('parentsName').value,
            address: document.getElementById('address').value,
            phone: document.getElementById('phone').value,
            factsHtml: quill.root.innerHTML,
            factsText: quill.getText(),
        };

        // Cifrar datos sensibles
        let encryptedData = null;
        if (userCryptoKey) {
            encryptedData = await encrypt(sensitiveData, userCryptoKey);
            console.log('[E2E] Datos cifrados exitosamente');
        } else {
            console.warn('[E2E] No hay clave de cifrado!');
            showToast('Error: No hay clave de cifrado', 'error');
            return;
        }

        // Datos a guardar (metadatos sin cifrar + datos cifrados)
        const noteData = {
            tags: selectedTags,
            isEncrypted: true,
            encryptedData: encryptedData,
            encryptedVersion: 1  // Para futuras migraciones
        };

        if (isEditing) {
            const noteDocRef = doc(db, "users", currentUserId, "notes", currentEditingNoteId);
            await updateDoc(noteDocRef, noteData);
            showToast("Nota actualizada (cifrada E2E)");
        } else {
            noteData.createdAt = serverTimestamp();
            const notesCollection = collection(db, "users", currentUserId, "notes");
            await addDoc(notesCollection, noteData);
            showToast("Nota guardada con cifrado E2E");
        }

        resetForm();
    } catch (error) {
        console.error("[E2E] Error durante el guardado:", error);
        showToast("Hubo un error al guardar la nota", 'error');
    } finally {
        saveNoteButton.disabled = false;
        saveNoteButton.querySelector('span').textContent = isEditing ? 'Actualizar Nota' : 'Guardar Nota';
    }
}

// ===== FIRESTORE LOGIC (WITH DECRYPTION) =====
function listenForNotes() {
    if (!currentUserId || !notesContainer) return;
    if (unsubscribeFromNotes) unsubscribeFromNotes();

    const notesCollection = collection(db, "users", currentUserId, "notes");
    const q = query(notesCollection);

    notesContainer.innerHTML = "<p><i class='fas fa-spinner fa-spin'></i> Cargando y descifrando notas...</p>";

    unsubscribeFromNotes = onSnapshot(q, async (querySnapshot) => {
        allNotes = [];
        let migrationNeeded = [];

        for (const docSnap of querySnapshot.docs) {
            const data = docSnap.data();
            let noteData = { id: docSnap.id, createdAt: data.createdAt, tags: data.tags || [] };

            if (data.isEncrypted && data.encryptedData) {
                // Descifrar nota
                try {
                    const decrypted = await decrypt(data.encryptedData, userCryptoKey);
                    noteData = { ...noteData, ...decrypted };
                    noteData._encrypted = true;
                } catch (err) {
                    console.error('[E2E] Error descifrando nota:', docSnap.id, err);
                    noteData.fullName = '[Error al descifrar]';
                    noteData.factsText = 'No se pudo descifrar esta nota. Puede que la contrasena sea incorrecta.';
                    noteData._decryptError = true;
                }
            } else {
                // Nota antigua sin cifrar - marcar para migracion
                noteData = { ...noteData, ...data };
                noteData._needsMigration = true;
                migrationNeeded.push({ id: docSnap.id, data: data });
            }

            allNotes.push(noteData);
        }

        allNotes.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
        populateTagFilter();
        applyFilters();

        // Migrar notas antiguas automaticamente
        if (migrationNeeded.length > 0) {
            console.log('[E2E] Migrando', migrationNeeded.length, 'notas antiguas...');
            showToast(`Migrando ${migrationNeeded.length} notas a cifrado E2E...`);
            await migrateOldNotes(migrationNeeded);
        }
    }, (error) => {
        console.error(`[E2E] Error al cargar las notas: ${error.message}`);
        notesContainer.innerHTML = "<p><i class='fas fa-exclamation-circle'></i> Error al cargar las notas. Por favor, recarga la pagina.</p>";
    });
}

// ===== MIGRATE OLD NOTES =====
async function migrateOldNotes(notes) {
    for (const item of notes) {
        try {
            const sensitiveData = {
                interventionLocation: item.data.interventionLocation || '',
                documentNumber: item.data.documentNumber || '',
                fullName: item.data.fullName || '',
                birthPlace: item.data.birthPlace || '',
                birthdate: item.data.birthdate || '',
                parentsName: item.data.parentsName || '',
                address: item.data.address || '',
                phone: item.data.phone || '',
                factsHtml: item.data.factsHtml || '',
                factsText: item.data.factsText || '',
            };

            const encryptedData = await encrypt(sensitiveData, userCryptoKey);

            const noteDocRef = doc(db, "users", currentUserId, "notes", item.id);
            await updateDoc(noteDocRef, {
                isEncrypted: true,
                encryptedData: encryptedData,
                encryptedVersion: 1,
                // Eliminar campos de texto plano
                interventionLocation: null,
                documentNumber: null,
                fullName: null,
                birthPlace: null,
                birthdate: null,
                parentsName: null,
                address: null,
                phone: null,
                factsHtml: null,
                factsText: null,
            });

            console.log('[E2E] Nota migrada:', item.id);
        } catch (err) {
            console.error('[E2E] Error migrando nota:', item.id, err);
        }
    }
    showToast('Migracion E2E completada');
}

// ===== SHARE NOTE =====
window.shareNote = async function (noteId) {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;

    const noteText = formatNoteForSharing(note);
    showShareModal(noteText);
};

function formatNoteForSharing(note) {
    const timestamp = note.createdAt?.toDate()
        ? note.createdAt.toDate().toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : 'N/A';

    const tags = note.tags && note.tags.length > 0
        ? `\nEtiquetas: ${note.tags.join(', ')}`
        : '';

    return `NOTA DE INTERVENCION
========================

Fecha y Hora: ${timestamp}
Lugar: ${note.interventionLocation || 'N/A'}
Documento: ${note.documentNumber || 'N/A'}
Nombre: ${note.fullName || 'N/A'}
Lugar de Nacimiento: ${note.birthPlace || 'N/A'}
Fecha de Nacimiento: ${note.birthdate || 'N/A'}
Telefono: ${note.phone || 'N/A'}
Padres: ${note.parentsName || 'N/A'}
Direccion: ${note.address || 'N/A'}

HECHOS:
${note.factsText || 'N/A'}${tags}

========================
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
            <p>Elige como quieres compartir esta nota:</p>
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
        "Estas seguro de eliminar esta nota? Esta accion no se puede deshacer."
    );

    if (!confirmed) return;

    try {
        const noteDocRef = doc(db, "users", currentUserId, "notes", noteId);
        await deleteDoc(noteDocRef);
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
                <p style="font-size: 1.125rem;">No hay notas que coincidan con tu busqueda</p>
            </div>
        `;
        return;
    }

    notesContainer.innerHTML = notesToShow.map(note => {
        const displayTimestamp = note.createdAt?.toDate()
            ? note.createdAt.toDate().toLocaleString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
            : 'N/A';

        const tagsHtml = (note.tags && note.tags.length > 0)
            ? `<div class="note-tags">${note.tags.map(tag =>
                `<span class="note-tag ${tagColorMap[tag] || ''}">${tag}</span>`
            ).join('')}</div>`
            : '';

        // Indicador de estado de cifrado
        const encryptedBadge = note._encrypted
            ? '<span style="background:#22c55e;color:#fff;padding:2px 6px;border-radius:4px;font-size:0.7rem;margin-left:8px;"><i class="fas fa-lock"></i> E2E</span>'
            : (note._decryptError
                ? '<span style="background:#ef4444;color:#fff;padding:2px 6px;border-radius:4px;font-size:0.7rem;margin-left:8px;"><i class="fas fa-exclamation-triangle"></i> Error</span>'
                : '');

        return `
        <div class="note">
            <p><strong><i class="fas fa-clock"></i> Fecha y Hora:</strong> ${displayTimestamp}${encryptedBadge}</p>
            <p><strong><i class="fas fa-map-marker-alt"></i> Lugar de Intervencion:</strong> ${note.interventionLocation || 'N/A'}</p>
            <p><strong><i class="fas fa-id-card"></i> Documento:</strong> ${note.documentNumber || 'N/A'}</p>
            <p><strong><i class="fas fa-user"></i> Nombre:</strong> ${note.fullName || 'N/A'}</p>
            <p><strong><i class="fas fa-globe"></i> Lugar de Nacimiento:</strong> ${note.birthPlace || 'N/A'}</p>
            <p><strong><i class="fas fa-calendar"></i> Fecha de Nacimiento:</strong> ${note.birthdate || 'N/A'}</p>
            <p><strong><i class="fas fa-phone"></i> Telefono:</strong> ${note.phone || 'N/A'}</p>
            <p><strong><i class="fas fa-users"></i> Padres:</strong> ${note.parentsName || 'N/A'}</p>
            <p><strong><i class="fas fa-home"></i> Direccion:</strong> ${note.address || 'N/A'}</p>
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
            <h3><i class="fas fa-exclamation-triangle"></i> Confirmacion</h3>
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