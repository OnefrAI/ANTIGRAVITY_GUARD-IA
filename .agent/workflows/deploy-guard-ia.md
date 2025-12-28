---
description: Cómo desplegar cambios en GUARD-IA (calendario y web)
---

# Deploy GUARD-IA

## Repositorios configurados

| Remote | URL | Uso |
|--------|-----|-----|
| `origin` | https://github.com/OnefrAI/ANTIGRAVITY_GUARD-IA.git | Desarrollo |
| `production` | https://github.com/OnefrAI/guard-ia-app.git | Producción (GitHub Pages) |

## Servidor de producción

- **URL**: www.guard-ia.es
- **Host**: Proxmox con Docker
- **Usuario SSH**: onefra@ubuntu
- **Ruta del repositorio Git**: `/opt/webapps/guard-ia-app`
- **Ruta que sirve Docker**: `/opt/webapps/beta-guardia` ⚠️ (diferente!)
- **Contenedor web**: `beta-guardia-web` (nginx:alpine)

> [!IMPORTANT]
> Docker monta `/opt/webapps/beta-guardia`, NO `guard-ia-app`. 
> Después de `git pull` hay que sincronizar con `rsync`.

---

## Proceso de Deploy

### 1. Hacer cambios locales
Edita los archivos en `herramientas-guardia/calendario-del-GUARD-IA/`

### 2. Incrementar versión del Service Worker
En `sw.js`, cambia el número de versión:
```javascript
const APP_VERSION = '2.0.1'; // Incrementar este número
```

### 3. Commit y push a ambos repos
```bash
git add .
git commit -m "feat: descripción del cambio"
git push origin main
git push production main
```

### 4. Actualizar servidor de producción
Conectar por SSH:
```bash
ssh onefra@ubuntu
```

Ejecutar estos comandos:
```bash
cd /opt/webapps/guard-ia-app
sudo git pull origin main
sudo rsync -av --delete /opt/webapps/guard-ia-app/ /opt/webapps/beta-guardia/
sudo docker restart beta-guardia-web
```

---

## Sistema de Auto-Actualización PWA

Los usuarios recibirán automáticamente las actualizaciones:
1. La app revisa cada 60 segundos si hay nueva versión
2. Si detecta cambios, descarga el nuevo Service Worker
3. Muestra un toast verde "¡Actualización aplicada!"
4. Recarga automáticamente la página

**No necesitan borrar caché ni reinstalar la app.**

---

## Archivos clave del sistema

| Archivo | Función |
|---------|---------|
| `sw.js` | Service Worker con auto-update (cambiar APP_VERSION aquí) |
| `index.html` | Detector de actualizaciones y toast |
| `script.js` | Lógica del calendario |
| `style.css` | Estilos |

---

## Troubleshooting

### El servidor no actualiza después del deploy
Verificar que Docker sirve la carpeta correcta:
```bash
sudo docker inspect beta-guardia-web | grep -A 5 "Mounts"
```
Si monta `beta-guardia`, ejecutar el rsync.

### Error "Could not resolve host: github.com"
Problema temporal de DNS. Esperar unos segundos y reintentar `git pull`.
