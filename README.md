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

## Empaquetar para Windows (x86 y x64)

Comandos directos:

```bash
npm run build:win:x64 -- --app felizometro
npm run build:win:x86 -- --app felizometro
```

Comando generico equivalente:

```bash
npm run build:app -- --app felizometro --platform win --target nsis --arch x64
npm run build:app -- --app felizometro --platform win --target nsis --arch x86
```

Nota: para compilar instaladores Windows desde macOS/Linux, `electron-builder` puede requerir herramientas de cross-build (por ejemplo Wine). Si falla el empaquetado, la opcion mas estable es ejecutar el build en un runner Windows (GitHub Actions) o en una maquina Windows.

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
- `.github/workflows/release-windows.yml`
- `docs/github-actions-release.md`

## Nota de rendimiento para Raspberry Pi

- Usa una sola ventana por app.
- Evita abrir herramientas de desarrollo en produccion.
- Si una web consume mucho, considera bajar resolucion (`width`/`height`) o usar modo kiosk/fullscreen.

## Troubleshooting EGL (Raspberry Pi)

Si ves logs como:

`ERROR:ui/gl/gl_display.cc:... eglQueryDeviceAttribEXT: Bad attribute`

Normalmente es un warning del driver EGL/Mesa durante deteccion de GPU en Chromium.

Para evitar problemas graficos, configura render por software en `config/apps.json`:

```json
"graphics": {
  "mode": "software"
}
```

Valores soportados:

- `auto` (por defecto)
- `hardware`
- `software`
