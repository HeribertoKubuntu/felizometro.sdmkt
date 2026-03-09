# GitHub Actions para publicar releases

Workflows:

- `.github/workflows/release.yml` (Linux ARM64)
- `.github/workflows/release-windows.yml` (Windows x64 y x86)
- `.github/workflows/release-combined.yml` (Linux ARM64 + Windows x64/x86 en un solo release)

## Como funciona

- Se ejecuta automaticamente cuando subes un tag `v*`.
- Tambien permite ejecucion manual (`workflow_dispatch`) con:
  - `appId` (por defecto `felizometro`)
  - `arch` (por defecto `arm64`)
  - `target` (por defecto `AppImage`)

## Trigger automatico por tag

```bash
git tag v1.0.1
git push origin v1.0.1
```

El workflow compila y adjunta al release:

- `*.AppImage`
- `*.AppImage.blockmap`
- `*.yml`

Para Windows, el workflow tambien adjunta:

- `*.exe`
- `*.msi` (si aplica)
- `*.blockmap`
- `*.yml`

## Trigger manual

En GitHub: `Actions` -> `Build and Release Electron App` -> `Run workflow`.

Para Windows: `Actions` -> `Build and Release Windows` -> `Run workflow`.

Para combinado: `Actions` -> `Build and Release Combined` -> `Run workflow`.

## Recomendacion de uso

- Si quieres un solo release con todo, usa solo `Build and Release Combined`.
- Evita disparar en paralelo los workflows individuales y el combinado para el mismo tag, porque podrias duplicar artefactos.

## Recomendaciones

- Mantener `package.json` version alineada con el tag.
- Si el repo es privado y el cliente usa updater GitHub privado, define `GH_TOKEN` en el entorno cliente.
- Verifica que en `config/apps.json` tengas:

```json
"autoUpdate": {
  "enabled": true,
  "provider": "github",
  "githubOwner": "TU_USUARIO_O_ORG",
  "githubRepo": "TU_REPO",
  "private": false
}
```
