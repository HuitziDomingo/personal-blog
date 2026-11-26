# Runbook: recuperar el acceso al admin (ADR-032)

Para cuando no puedes entrar al admin: olvidaste la contraseña, o sospechas que se filtró y quieres cerrar todas las sesiones. Si todavía puedes entrar, usa *Perfil → Cambiar contraseña* en el admin: hace lo mismo sin tocar la base.

`make reset-admin-password` (`services/api/cmd/reset-admin-password`) guarda el hash bcrypt de una contraseña nueva y revoca todos los refresh tokens del usuario. Lo corres tú, desde la raíz del repo, con tu sesión de `gcloud`. Nunca en CI.

## Antes de empezar

- Go instalado (el comando se compila con `go run`) y el repo en `main` actualizado.
- `gcloud config get-value project` devuelve `<PROJECT_ID>` y tu cuenta puede leer el secreto `mongo-uri` (paso 7 del [runbook de despliegue](despliegue.md)).
- Una terminal de verdad: el comando lee el email y la contraseña sin eco y no arranca si stdin es una tubería (`echo … |`).

## 1. Simulacro

Es el modo por defecto. La URI sale de Secret Manager dentro de `$(...)`: no pasa por la pantalla ni queda en el historial, y el comando nunca la imprime.

```sh
TARGET_MONGO_URI="$(gcloud secrets versions access latest --secret=mongo-uri)" \
  make reset-admin-password TARGET_DB=personal_blog
```

Te pide el email del administrador, la contraseña nueva y su confirmación; nada de lo que escribes se ve. La contraseña nueva necesita al menos 14 caracteres, como mucho 72 bytes (los acentos ocupan 2 y los emojis 4) y debe ser distinta de la actual.

Si todo cuadra, responde con el id del usuario y `No se cambió nada`. Si no, dice por qué: no hay usuario con ese email en esa base, la contraseña es igual a la actual o no cumple el largo. No imprime el email ni la contraseña.

## 2. Cambio

Lo mismo con `DRY_RUN=0`. Vuelve a pedir el email y la contraseña:

```sh
TARGET_MONGO_URI="$(gcloud secrets versions access latest --secret=mongo-uri)" \
  make reset-admin-password TARGET_DB=personal_blog DRY_RUN=0
```

Responde `Contraseña cambiada para el usuario <id>` y cuántos refresh tokens revocó. Desde ese momento ningún dispositivo puede renovar su sesión.

## 3. Comprobación

1. Entra al admin con la contraseña nueva.
2. En Cloud Logging, ningún log del comando: escribe directo en Mongo. Los cambios desde el admin sí dejan `audit=password_change`.

## Si sospechas que robaron una sesión

Los JWT de acceso ya emitidos siguen valiendo hasta que vencen, 15 minutos como mucho. Si no puedes esperar, rota `JWT_SECRET`: invalida al instante todos los JWT y cierra todas las sesiones, también la tuya.

```sh
openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add jwt-secret --data-file=-
gcloud run services update api --region="$REGION"
```

La revisión nueva lee `latest` al arrancar. Después deshabilita la versión anterior: `gcloud secrets versions disable <N> --secret=jwt-secret`.

## En local

Con el Mongo de `make db-up` y la base de `.env`, en un subshell para no dejar las variables de `.env` en tu terminal:

```sh
(set -a && . ./.env && set +a && TARGET_MONGO_URI="$MONGO_URI" make reset-admin-password TARGET_DB="$MONGO_DB_NAME")
```
