# Actualizaciones con GitHub Releases

Esta opcion evita operar un servidor propio Nginx. `electron-updater` consulta los releases del repositorio.

## 1) Configurar app

Edita `config/apps.json`:

```json
{
  "apps": [
    {
      "id": "felizometro",
      "name": "Felizometro",
      "url": "https://felizometro-app.sdmkt.org/login",
      "autoUpdate": {
        "enabled": true,
        "provider": "github",
        "githubOwner": "TU_USUARIO_O_ORG",
        "githubRepo": "felizometro-desktop",
        "private": false
      }
    }
  ]
}
```

Para repos privados usa `private: true` y define `GH_TOKEN` en el cliente.

## 2) Build y publish

Incrementa version en `package.json` y genera build ARM64:

```bash
npm run build:app -- --app felizometro --target AppImage --arch arm64
```

Publica artefactos en GitHub Release (tag igual a la version, por ejemplo `v1.0.1`):

- `*.AppImage`
- `*.AppImage.blockmap`
- `latest-linux.yml` (o el archivo yml que genere tu build)

## 3) Variables opcionales

Si quieres sobreescribir por entorno:

```bash
export AUTO_UPDATE_PROVIDER=github
export AUTO_UPDATE_GITHUB_OWNER=TU_USUARIO_O_ORG
export AUTO_UPDATE_GITHUB_REPO=felizometro-desktop
```

Para repos privados en cliente:

```bash
export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

## 4) Flujo recomendado

1. Cambia `version`.
2. Genera artefactos ARM64.
3. Crea release en GitHub con tag de version.
4. Adjunta AppImage, blockmap y yml.
5. Al abrir app instalada, detecta update y lo descarga.

## 5) Verificacion

Confirma que el release tenga los artefactos y que el tag coincida con la version empaquetada.
