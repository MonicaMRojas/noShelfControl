# No Shelf Control — Biblioteca del club de lectura

Aplicación web privada para las integrantes del club de lectura **No Shelf Control**:
biblioteca de libros, progreso de lectura, valoraciones, perfiles de lectora y
rondas de propuestas con sorteo para elegir la próxima lectura.

- HTML, CSS y JavaScript puro (sin build, sin dependencias de npm).
- Firebase **Authentication** + **Cloud Firestore** + **Hosting**, todo en el plan gratuito **Spark**.
- Sin Firebase Storage, sin Cloud Functions, sin servicios de pago, sin tarjeta.
- Proyecto Firebase **propio e independiente** de cualquier otro club.

---

## 1. Antes de empezar: el logotipo

Copia el logotipo oficial como **`assets/logo.png`** (PNG, idealmente cuadrado o casi cuadrado).
Se usa en el login, la pantalla de bienvenida, la cabecera de Inicio y el onboarding.

Mientras ese archivo no exista, la app muestra un marcador de texto
(`assets/logo-placeholder.svg`) para que nada se vea roto.

**Favicon:** el icono de pestaña actual es el marcador `assets/logo-placeholder.svg`.
Para usar el logotipo, exporta una versión cuadrada (por ejemplo 192×192) como
`assets/favicon.png` y cambia en `index.html` la línea
`<link rel="icon" ... href="assets/logo-placeholder.svg" />` por
`<link rel="icon" type="image/png" href="assets/favicon.png" />`.

---

## 2. Crear el proyecto de Firebase (paso a paso)

> Importante: crea un proyecto **nuevo**. No reutilices ningún proyecto de otro club.

### 2.1 Crear el proyecto
1. Entra en <https://console.firebase.google.com> con la cuenta de Google del club.
2. **Agregar proyecto** → ponle un nombre (p. ej. `no-shelf-control`) → continúa.
3. Google Analytics: puedes desactivarlo (no hace falta).

### 2.2 Registrar la aplicación web
1. En la página principal del proyecto pulsa el icono **`</>` (Web)**.
2. Apodo de la app: `No Shelf Control`. **No** marques "Firebase Hosting" ahora (lo haremos por consola).
3. Copia el bloque `firebaseConfig` que te muestra Firebase.
4. Pega esos valores en **`js/firebase-config.js`**, sustituyendo todos los `PEGA_AQUI_...`.
   Mientras queden valores `PEGA_AQUI`, la app muestra un aviso de "Falta configurar Firebase".

> La `apiKey` de Firebase para web no es un secreto: la seguridad la dan las reglas de Firestore
> y las restricciones de Authentication, no esconder esa clave.

### 2.3 Configurar Authentication
1. **Build → Authentication → Comenzar**.
2. Pestaña **Sign-in method**:
   - Activa **Correo electrónico/contraseña**.
   - Activa **Google** (opcional): elige un correo de asistencia y guarda.
3. **Settings → Authorized domains**: al desplegar, `tu-proyecto.web.app` y
   `tu-proyecto.firebaseapp.com` ya aparecen. Si usas un dominio propio, añádelo aquí.
4. (Recomendado) En **Plantillas de correo** puedes traducir y personalizar el correo de
   "restablecer contraseña" con el nombre No Shelf Control.

### 2.4 Crear Firestore
1. **Build → Firestore Database → Crear base de datos**.
2. Elige la ubicación (p. ej. `eur3` Europa) — **no se puede cambiar después**.
3. Modo **producción** (las reglas las publicaremos en el siguiente paso).

### 2.5 Instalar y preparar Firebase CLI (Windows PowerShell)
Necesitas Node.js instalado. En PowerShell:

```powershell
npm install -g firebase-tools
firebase.cmd login
```

> En Windows PowerShell usa siempre **`firebase.cmd`** (no `firebase`), para evitar el
> error de "la ejecución de scripts está deshabilitada".

En la carpeta del proyecto, copia el archivo de ejemplo y pon **el ID de tu proyecto nuevo**:

```powershell
Copy-Item .firebaserc.example .firebaserc
notepad .firebaserc
```

Debe quedar así (con tu ID real, el que aparece en Configuración del proyecto):

```json
{ "projects": { "default": "no-shelf-control-xxxxx" } }
```

Comprueba que apunta al proyecto correcto antes de desplegar nada:

```powershell
firebase.cmd projects:list
firebase.cmd use
```

### 2.6 Publicar reglas e índices
```powershell
firebase.cmd deploy --only firestore:rules,firestore:indexes
```

Esto publica `firestore.rules` y `firestore.indexes.json` (los índices pueden tardar unos
minutos en construirse; hasta entonces alguna consulta de Inicio puede dar error).

### 2.7 Publicar la web (Hosting)
```powershell
firebase.cmd deploy --only hosting
```

Al terminar te dará la URL (`https://tu-proyecto.web.app`). Ese es el enlace que compartes
por WhatsApp o Instagram.

Para publicarlo todo de una vez: `firebase.cmd deploy`.

### 2.8 Crear la primera administradora
Por seguridad **nadie puede hacerse administradora desde la app**. La primera se crea a mano:

1. Abre la web desplegada, crea tu cuenta y completa tu perfil.
2. En Firebase Console → **Firestore Database → Data → colección `users`** → abre tu documento
   (su ID es tu UID de Authentication).
3. Edita el campo **`role`**: cambia `member` por **`admin`** y guarda.
4. Recarga la app. En **Mi perfil** aparece el botón **Panel de administración**.

A partir de ahí, las administradoras pueden dar o quitar permisos a otras integrantes desde
**Administración → Integrantes**.

---

## 3. Cómo funciona

### Navegación
Inicio · Biblioteca · El Club · Propuestas (solo cuando la sección está activada) · Mi perfil.
El panel de administración se abre desde Mi perfil (solo administradoras).

### Libros
Las administradoras crean y editan libros (título, autor/a, género, sinopsis, portada por URL
o por archivo comprimido, páginas, fechas de lectura y reunión, estado). Estados:
*Próximamente*, *Leyendo ahora* (solo uno a la vez: es "Nuestra lectura actual") y *Finalizado*.

### Lecturas personales
Cada integrante marca cada libro como *Pendiente*, *Leyendo* o *Leído*. En *Leyendo* aparece
**¿Por dónde vas?**: porcentaje o página actual (si el libro tiene páginas, calcula el porcentaje
solo). Al marcar *Leído* el progreso pasa al 100 %. Las reseñas (0,5–5 estrellas + comentario)
se guardan en `reviews/{uid}_{bookId}`; nadie puede tocar las de otra persona.

### Propuestas y sorteo
1. **Una administradora crea una ronda** (Administración → Propuestas): abrir ahora o
   programar apertura y cierre, duración por defecto 7 días, y si la sección es visible.
2. Cada integrante puede proponer **hasta 5 libros** (título y autor/a obligatorios, género
   opcional). Ve en tiempo real todas las propuestas, con buscador y quién propuso cada una.
3. **Duplicados:** se comparan ignorando mayúsculas, tildes, espacios y puntuación simple.
   El aviso es "¡Este libro ya está entre las propuestas!".
4. Al vencer la fecha de cierre, **las propuestas se bloquean solas** (lo decide el servidor
   con su propia hora, no el navegador).
5. **El sorteo lo hace siempre una administradora.** Si nadie abre la app justo al vencer, la
   ronda queda *Pendiente de sorteo*: al entrar una administradora ve un aviso en Inicio y en
   el panel, y pulsa **Realizar sorteo**. El ganador se guarda en Firestore y es idéntico para
   todas. El sorteo es idempotente: repetirlo no cambia el resultado.
6. Las administradoras pueden cerrar antes de tiempo, reabrir, reprogramar fechas, eliminar
   propuestas, elegir otro ganador a mano y **añadir el ganador a la biblioteca**.
7. **Desactivar la sección** solo la oculta: las propuestas no se borran.

**Apertura automática (opcional):** si el libro actual tiene marcada la casilla
*"Abrir las propuestas automáticamente al llegar la fecha de reunión"* (activada por defecto),
la primera integrante que entre pasada esa fecha abre la ronda de 7 días. Desmarca la casilla
en el libro para desactivarlo. Esto solo **abre**; cerrar y sortear es siempre cosa de una
administradora.

### Seguridad
`firestore.rules` valida en el servidor (no se confía en el navegador):

| Regla | Dónde |
|---|---|
| Cada integrante solo edita su perfil y no puede cambiar su `role` | `users` |
| Solo una administradora cambia el rol de **otra** persona (nunca el propio) | `users` |
| Solo administradoras crean/editan/borran libros | `books` |
| Cada integrante solo escribe sus reseñas; ID `{uid}_{bookId}`; rangos validados | `reviews` |
| Máximo 5 propuestas por persona y ronda (contador atómico en la ronda, comprobado con `getAfter`) | `bookProposals` + `proposalRounds` |
| Sin duplicados: el ID del documento es `roundId_títuloNormalizado_autorNormalizado` y las reglas exigen ese formato | `bookProposals` |
| Solo se propone dentro de la ventana `opensAt ≤ ahora < closesAt` con la ronda abierta | `bookProposals` |
| Solo administradoras crean rondas (salvo la automática, con forma exacta validada), cierran, sortean, reabren o borran | `proposalRounds` |
| Todo lo no listado está denegado | — |

**Límites conocidos:** (a) el sorteo lo calcula el navegador de la administradora (no hay
Cloud Functions); las reglas garantizan que solo una administradora puede escribir el resultado
y que queda guardado, pero no pueden "demostrar" que el azar fue honesto. (b) Las reglas no pueden
volver a normalizar el texto de un título, así que una persona con conocimientos técnicos podría
inventar una variante del mismo libro; la lista de propuestas la modera la administración.

---

## 4. Modelo de datos (Firestore)

```
users/{uid}
  name, surname, photoURL (JPEG comprimido, Data URL), quote, favoriteGenre,
  role: "member" | "admin", createdAt

books/{bookId}
  title, author, genre, synopsis, coverURL (URL o Data URL), pages,
  readingDate, meetingDate ("YYYY-MM-DD"), status: "proximamente"|"leyendo_ahora"|"finalizado",
  autoProposals (bool), createdAt

reviews/{uid}_{bookId}
  userId, bookId, readingStatus: "pendiente"|"leyendo"|"leido",
  rating (0.5–5), comment, progressType, progressPercentage (0–100),
  currentPage, totalPages, progressUpdatedAt, createdAt, updatedAt

proposalRounds/{roundId}        (id del libro si es automática, aleatorio si la crea una admin)
  title, sourceBookId, status: "open"|"closed", visible, opensAt, closesAt,
  proposalCounts: { uid: n }, winnerProposalId, winnerBookTitle, winnerBookAuthor,
  winnerBookGenre, addedToLibrary, addedBookId, createdBy, createdAt, closedAt

bookProposals/{roundId}_{títuloNormalizado}_{autorNormalizado}
  roundId, userId, title, author, genre, normalizedTitle, normalizedAuthor, createdAt
```

Estados "efectivos" de una ronda (calculados con la hora): *programada*, *abierta*,
*pendiente de sorteo* (venció y falta el sorteo) y *cerrada*.

---

## 5. Estructura del proyecto

```
index.html            Punto de entrada
css/styles.css        Estilos (variables de color en :root)
assets/               logo.png (tú lo añades) y logo-placeholder.svg
js/firebase-config.js Configuración del proyecto Firebase (la rellenas tú)
js/firebase-init.js   Inicializa Auth y Firestore
js/auth.js            Registro, login, Google, recuperar contraseña
js/db.js              Todas las lecturas/escrituras de Firestore y la lógica de propuestas
js/state.js           Estado global (usuaria, perfil, rol)
js/router.js          Router por hash (#/ruta)
js/main.js            Arranque, navegación inferior, apertura automática
js/utils.js           Utilidades (fechas, estrellas, compresión de imágenes...)
js/views/             login, onboarding, home, library, bookDetail, community,
                      profile, publicProfile, editProfile, proposals, admin, wrapped, shared
firestore.rules       Reglas de seguridad
firestore.indexes.json Índices compuestos
firebase.json         Hosting + Firestore
.firebaserc.example   Plantilla (copiar a .firebaserc con TU proyecto)
```

## 6. Probar en local
Los módulos ES necesitan un servidor (no abrir `index.html` con doble clic):

```powershell
npx serve .
```

o `firebase.cmd serve --only hosting`. Añade `localhost` en Authentication → Authorized domains
si usas el acceso con Google.

## 7. Cuotas del plan Spark
Un club pequeño queda muy por debajo de los límites gratuitos de Firestore (50 000 lecturas y
20 000 escrituras al día). Las fotos de perfil se comprimen a ~100 KB y las portadas
conviene indicarlas por URL para no engordar la base de datos.
