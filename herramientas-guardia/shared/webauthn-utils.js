/**
 * GUARD-IA WebAuthn Utils
 * Autenticación biométrica (huella, Face ID, Windows Hello)
 * Con fallback a contraseña
 */

const WEBAUTHN_RP_NAME = 'GUARD-IA';
const CREDENTIAL_STORAGE_KEY = 'guardia_webauthn_credential';

/**
 * Verifica si WebAuthn está disponible en el navegador
 * @returns {boolean}
 */
export function isWebAuthnAvailable() {
    return window.PublicKeyCredential !== undefined &&
        typeof window.PublicKeyCredential === 'function';
}

/**
 * Verifica si hay credenciales biométricas guardadas para este usuario
 * @param {string} userId - ID del usuario
 * @returns {boolean}
 */
export function hasStoredCredential(userId) {
    const stored = localStorage.getItem(`${CREDENTIAL_STORAGE_KEY}_${userId}`);
    return stored !== null;
}

/**
 * Registra una nueva credencial biométrica
 * @param {string} userId - ID del usuario
 * @param {string} userEmail - Email del usuario (para display)
 * @returns {Promise<boolean>} True si el registro fue exitoso
 */
export async function registerBiometric(userId, userEmail) {
    if (!isWebAuthnAvailable()) {
        console.log('[WebAuthn] No disponible en este navegador');
        return false;
    }

    try {
        // Generar challenge aleatorio
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);

        // Opciones para crear credencial
        const publicKeyCredentialCreationOptions = {
            challenge: challenge,
            rp: {
                name: WEBAUTHN_RP_NAME,
                id: window.location.hostname
            },
            user: {
                id: Uint8Array.from(userId, c => c.charCodeAt(0)),
                name: userEmail,
                displayName: userEmail.split('@')[0]
            },
            pubKeyCredParams: [
                { alg: -7, type: 'public-key' },   // ES256
                { alg: -257, type: 'public-key' }  // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: 'platform', // Solo biometría del dispositivo
                userVerification: 'required',
                residentKey: 'preferred'
            },
            timeout: 60000,
            attestation: 'none'
        };

        console.log('[WebAuthn] Solicitando registro biométrico...');
        const credential = await navigator.credentials.create({
            publicKey: publicKeyCredentialCreationOptions
        });

        if (!credential) {
            console.log('[WebAuthn] Registro cancelado por el usuario');
            return false;
        }

        // Guardar credencial ID para futuras autenticaciones
        const credentialData = {
            id: credential.id,
            rawId: arrayBufferToBase64(credential.rawId),
            type: credential.type,
            registeredAt: Date.now()
        };

        localStorage.setItem(`${CREDENTIAL_STORAGE_KEY}_${userId}`, JSON.stringify(credentialData));
        console.log('[WebAuthn] Credencial biométrica registrada exitosamente');
        return true;

    } catch (error) {
        console.error('[WebAuthn] Error en registro:', error);
        if (error.name === 'NotAllowedError') {
            console.log('[WebAuthn] Usuario canceló o denegó el permiso');
        } else if (error.name === 'NotSupportedError') {
            console.log('[WebAuthn] Dispositivo no soporta biometría');
        }
        return false;
    }
}

/**
 * Autentica usando biometría
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} True si la autenticación fue exitosa
 */
export async function authenticateWithBiometric(userId) {
    if (!isWebAuthnAvailable()) {
        console.log('[WebAuthn] No disponible');
        return false;
    }

    const storedCredential = localStorage.getItem(`${CREDENTIAL_STORAGE_KEY}_${userId}`);
    if (!storedCredential) {
        console.log('[WebAuthn] No hay credencial guardada para este usuario');
        return false;
    }

    try {
        const credentialData = JSON.parse(storedCredential);
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);

        const publicKeyCredentialRequestOptions = {
            challenge: challenge,
            rpId: window.location.hostname,
            allowCredentials: [{
                id: base64ToArrayBuffer(credentialData.rawId),
                type: 'public-key',
                transports: ['internal']
            }],
            userVerification: 'required',
            timeout: 60000
        };

        console.log('[WebAuthn] Solicitando autenticación biométrica...');
        const assertion = await navigator.credentials.get({
            publicKey: publicKeyCredentialRequestOptions
        });

        if (assertion) {
            console.log('[WebAuthn] Autenticación biométrica exitosa');
            return true;
        }

        return false;

    } catch (error) {
        console.error('[WebAuthn] Error en autenticación:', error);
        if (error.name === 'NotAllowedError') {
            console.log('[WebAuthn] Usuario canceló o biometría falló');
        }
        return false;
    }
}

/**
 * Elimina la credencial biométrica guardada
 * @param {string} userId - ID del usuario
 */
export function removeBiometricCredential(userId) {
    localStorage.removeItem(`${CREDENTIAL_STORAGE_KEY}_${userId}`);
    console.log('[WebAuthn] Credencial eliminada');
}

// ===== UTILIDADES =====

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
