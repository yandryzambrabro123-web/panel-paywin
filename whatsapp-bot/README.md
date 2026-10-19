# Bot de WhatsApp de Win

Esto es un servidor aparte (no vive en Vercel) que mantiene conectado el número de
WhatsApp **dedicado** y le manda mensajes a tus grupos cuando el panel se lo pide --
sin que tengas que copiar, pegar, ni abrir WhatsApp a mano.

**Antes de empezar, ten claro el riesgo:** esto no es la API oficial de WhatsApp (esa
no permite mandar mensajes a grupos ya existentes). Usa el mismo protocolo que
WhatsApp Web, así que técnicamente va contra los términos de servicio de WhatsApp.
Por eso es obligatorio usar un número **dedicado solo a esto**, nunca el número
principal del negocio -- si algún día WhatsApp lo restringe, no afecta tu línea real.

## 1. Crear cuenta en Railway

1. Entra a [railway.app](https://railway.app) y crea una cuenta (puedes entrar con tu
   cuenta de GitHub).
2. Te va a pedir una tarjeta para el plan de pago (sale unos $5/mes aprox. por tener
   esto corriendo 24/7). Es normal, es el costo de tener un servidor siempre
   encendido.

## 2. Desplegar este servicio

1. En Railway, "New Project" → "Deploy from GitHub repo" → elige el repo `panel-paywin`.
2. Railway va a querer desplegar todo el repo. Entra a los **Settings** del servicio
   que se creó y en **"Root Directory"** pon: `whatsapp-bot`
   (así Railway solo construye y corre esta carpeta, no el resto del panel).
3. En **Variables** (variables de entorno), agrega:
   - `API_KEY` → inventa una clave larga y rara (ej: una mezcla de letras y números,
     de al menos 20 caracteres). La vamos a necesitar después para conectar el panel.
4. En **Settings → Volumes**, agrega un volumen montado en `/app/auth_info`. **Esto es
   importante**: sin esto, cada vez que Railway reinicie el servicio vas a tener que
   volver a escanear el QR porque la sesión se pierde.
5. Dale a Deploy. Cuando termine, Railway te da una URL pública (algo como
   `https://win-whatsapp-bot-production.up.railway.app`). Esa es la URL del bot --
   guárdala.

## 3. Vincular el número dedicado

1. Abre `https://TU-URL-DE-RAILWAY/qr` en el navegador de **cualquier teléfono**
   (no tiene que ser el dedicado, solo necesitas ver el código).
2. En el **teléfono con el número dedicado**, abre WhatsApp → Ajustes (o Configuración)
   → **Dispositivos vinculados** → **Vincular un dispositivo**, y escanea el QR que
   salió en el navegador.
3. Cuando conecte, la página de `/qr` va a decir "Ya está conectado". Listo, el bot ya
   quedó enlazado a ese número -- no hay que repetir esto salvo que se desvincule.

## 4. Meter el número dedicado a tus grupos

Desde el WhatsApp del número dedicado, entra a cada uno de tus links de invitación
(Gratis 1, Gratis 2, Gratis 3, VIP, VIP 1XBET, VIP Más Parley, 1X2) y únete, como lo
haría cualquier miembro nuevo.

## 5. Obtener el id real de cada grupo

Con el bot ya conectado y metido en los grupos, abre en el navegador (puede ser desde
la computadora):

```
https://TU-URL-DE-RAILWAY/grupos
```

Pero como es una ruta protegida, necesitas mandar la clave en un header -- lo más
fácil es con este comando (cámbialo con tu URL y tu API_KEY):

```bash
curl -H "x-api-key: TU_API_KEY" https://TU-URL-DE-RAILWAY/grupos
```

Eso te devuelve algo como:

```json
{ "grupos": [ { "id": "1203xxxxxxxxxx@g.us", "nombre": "Gratis 1" }, ... ] }
```

Pásame esa lista (o los ids uno por uno) y yo actualizo el panel para que cada grupo
ya tenga su id real conectado -- ahí mismo se activa el botón de "Enviar automático"
en la pantalla de confirmación de Win.

## Notas

- Si algún día el número se desvincula (sale de la lista de dispositivos del
  WhatsApp del celular), hay que repetir el paso 3.
- El servidor manda cada mensaje con una pausa aleatoria de 1.5 a 4 segundos, para
  que no se vea como una ráfaga robótica -- de todas formas, no hay garantía de que
  WhatsApp nunca lo detecte, por eso lo del número aparte.
- Nadie más que el panel (con la API_KEY correcta) puede usar `/enviar` ni `/grupos`.
