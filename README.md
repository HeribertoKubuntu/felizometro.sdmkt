# hery_nativefier

Proyecto base tipo nativefier para convertir apps web en aplicaciones de escritorio ligeras usando Electron.

## Requisitos

- Node.js 20+
- npm 10+
- Raspberry Pi OS 64-bit recomendado

## Instalacion

```bash
npm install
```

## Configurar apps

Edita `config/apps.json` y agrega tus aplicaciones:

```json
{
  "apps": [
    {
      "id": "miapp",
      "name": "Mi App",
      "url": "https://miapp.com",
      "width": 1280,
      "height": 800,
      "fullscreen": false,
      "kiosk": false,
      "userAgent": "",
      "icon": ""
    }
  ]
}
```

## Ejecutar en desarrollo

Listar apps:

```bash
npm run list
```

Ejecutar una app especifica:

```bash
npm run dev -- --app miapp
```

Si no pasas `--app`, se ejecuta la primera app del arreglo.

## Empaquetar para Linux (Raspberry Pi)

Empaquetado basico (target `dir`):

```bash
npm run build:app -- --app miapp --target dir --arch arm64
```

Otros targets comunes:

```bash
npm run build:app -- --app miapp --target AppImage --arch arm64
npm run build:app -- --app miapp --target deb --arch arm64
```

Salida generada en `dist/<id-app>/`.

## Actualizaciones automaticas (electron-updater)

El proyecto ya incluye soporte para `electron-updater` usando provider `generic`.

Tambien soporta provider `github` (GitHub Releases).

Configura cada app en `config/apps.json`:

```json
{
  "id": "felizometro",
  "name": "Felizometro",
  "url": "https://felizometro-app.sdmkt.org/login",
  "autoUpdate": {
    "enabled": true,
    "feedUrl": "https://tu-servidor-updates/felizometro/"
  }
}
```

Notas importantes:

- En desarrollo (`npm run dev`) no busca updates.
- Solo busca updates cuando la app esta empaquetada (`app.isPackaged = true`).
- `feedUrl` debe exponer los artefactos y metadatos de `electron-builder` para Linux.

Tambien puedes inyectar el feed por variable de entorno al empaquetar:

```bash
AUTO_UPDATE_FEED_URL="https://tu-servidor-updates/felizometro/" npm run build:app -- --app felizometro --target AppImage --arch arm64
```

Guia detallada de publicacion y estructura de servidor:

- `docs/update-server-example.md`
- `deploy/nginx/felizometro-updates.conf`

### Opcion GitHub Releases (sin servidor propio)

Configura en `config/apps.json`:

```json
"autoUpdate": {
  "enabled": true,
  "provider": "github",
  "githubOwner": "TU_USUARIO_O_ORG",
  "githubRepo": "felizometro-desktop",
  "private": false
}
```

Guia completa:

- `docs/github-releases-updates.md`

Automatizacion de releases con GitHub Actions:

- `.github/workflows/release.yml`
- `docs/github-actions-release.md`

## Nota de rendimiento para Raspberry Pi

- Usa una sola ventana por app.
- Evita abrir herramientas de desarrollo en produccion.
- Si una web consume mucho, considera bajar resolucion (`width`/`height`) o usar modo kiosk/fullscreen.
