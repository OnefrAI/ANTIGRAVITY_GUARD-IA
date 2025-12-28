/**
 * GUARD-IA Crypto Utils
 * Cifrado E2E usando Web Crypto API
 * AES-GCM 256-bit + PBKDF2 para derivación de clave
 */

// Configuración
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Genera un salt aleatorio para el usuario
 * @returns {string} Salt en formato Base64
 */
export function generateSalt() {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    return arrayBufferToBase64(salt);
}

/**
 * Deriva una clave AES-256 desde la contraseña del usuario
 * @param {string} password - Contraseña del usuario
 * @param {string} saltBase64 - Salt en formato Base64
 * @returns {Promise<CryptoKey>} Clave AES para cifrado/descifrado
 */
export async function deriveKey(password, saltBase64) {
    const encoder = new TextEncoder();
    const salt = base64ToArrayBuffer(saltBase64);

    // Importar contraseña como clave base
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    // Derivar clave AES-256 usando PBKDF2
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Cifra datos usando AES-GCM
 * @param {object|string} data - Datos a cifrar
 * @param {CryptoKey} key - Clave AES
 * @returns {Promise<string>} Datos cifrados en formato Base64 (iv:ciphertext)
 */
export async function encrypt(data, key) {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const dataString = typeof data === 'string' ? data : JSON.stringify(data);

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encoder.encode(dataString)
    );

    // Formato: iv:ciphertext (ambos en Base64)
    const ivBase64 = arrayBufferToBase64(iv);
    const ciphertextBase64 = arrayBufferToBase64(new Uint8Array(encrypted));

    return `${ivBase64}:${ciphertextBase64}`;
}

/**
 * Descifra datos usando AES-GCM
 * @param {string} encryptedData - Datos cifrados (formato iv:ciphertext en Base64)
 * @param {CryptoKey} key - Clave AES
 * @returns {Promise<object|string>} Datos descifrados
 */
export async function decrypt(encryptedData, key) {
    const decoder = new TextDecoder();

    const [ivBase64, ciphertextBase64] = encryptedData.split(':');
    const iv = base64ToArrayBuffer(ivBase64);
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
    );

    const decryptedString = decoder.decode(decrypted);

    // Intentar parsear como JSON, si falla devolver string
    try {
        return JSON.parse(decryptedString);
    } catch {
        return decryptedString;
    }
}

/**
 * Verifica si un string parece estar cifrado
 * @param {string} data - Datos a verificar
 * @returns {boolean} True si parece cifrado
 */
export function isEncrypted(data) {
    if (typeof data !== 'string') return false;
    const parts = data.split(':');
    if (parts.length !== 2) return false;
    // Verificar que ambas partes parecen Base64 válido
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    return base64Regex.test(parts[0]) && base64Regex.test(parts[1]);
}

// ===== UTILIDADES =====

function arrayBufferToBase64(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
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
    return bytes;
}
