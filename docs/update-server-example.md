# Ejemplo de servidor de updates (Raspberry Pi ARM64)

Este ejemplo usa `electron-updater` con provider `generic` y una carpeta estatica servida por Nginx.

## 1) Build de nueva version

Primero sube la version en `package.json` (ejemplo `1.0.1`) y genera artefactos:

```bash
npm run build:app -- --app felizometro --target AppImage --arch arm64
```

## 2) Estructura esperada en el servidor

URL de feed recomendada:

`https://updates.tudominio.com/felizometro/`

Directorio en el servidor:

```text
/var/www/updates/felizometro/
  latest-linux.yml
  felizometro-1.0.1-arm64.AppImage
  felizometro-1.0.1-arm64.AppImage.blockmap
```

Notas:

- El archivo `latest-linux.yml` lo genera `electron-builder`.
- El nombre exacto del AppImage puede variar segun `productName` y version.
- Si en tu build aparece `latest.yml` o `latest-linux-arm64.yml`, publica ese archivo tambien y usa el que genero tu build.

## 3) Publicar artefactos

Desde tu maquina de build, copia los archivos al servidor:

```bash
scp dist/felizometro/*.yml usuario@tu-servidor:/var/www/updates/felizometro/
scp dist/felizometro/*.AppImage* usuario@tu-servidor:/var/www/updates/felizometro/
```

## 4) Configurar tu app

En `config/apps.json`:

```json
{
  "id": "felizometro",
  "name": "Felizometro",
  "url": "https://felizometro-app.sdmkt.org/login",
  "autoUpdate": {
    "enabled": true,
    "feedUrl": "https://updates.tudominio.com/felizometro/"
  }
}
```

## 5) Flujo de releases

1. Incrementa version en `package.json`.
2. Genera build AppImage ARM64.
3. Publica `.AppImage`, `.blockmap` y `.yml` en `/var/www/updates/felizometro/`.
4. Reinicia app cliente si estaba abierta.
5. La app verificara updates y descargara la nueva version.

## 6) Verificacion rapida

Prueba que el manifiesto sea accesible por HTTP:

```bash
curl -I https://updates.tudominio.com/felizometro/latest-linux.yml
```

Debe responder `200 OK`.
