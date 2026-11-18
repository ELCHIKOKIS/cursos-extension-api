# Aula Abierta | Cursos de extensión

Aplicación web y API REST para consultar cursos, crear inscripciones con comprobante y gestionar cursos y participantes con roles de administrador, docente y estudiante. Construida con HTML, CSS, JavaScript, Express y MongoDB.

## Requisitos

- Node.js 20 o superior.
- MongoDB local o una instancia de MongoDB Atlas accesible.

## Instalación y configuración

Desde PowerShell, en la carpeta del proyecto:

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Configura `.env` con una URI válida y credenciales administrativas:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/cursos_extension
PORT=3000
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=una-clave-segura
JWT_SECRET=un-secreto-aleatorio-de-al-menos-32-bytes
```

No compartas ni subas `.env`; está excluido por `.gitignore`. Los comprobantes se guardan en GridFS dentro de la misma base de MongoDB. Define un `JWT_SECRET` aleatorio y privado de al menos 32 caracteres. Puedes generarlo desde PowerShell con:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## Iniciar la aplicación

```powershell
npm run dev
```

Abre **http://localhost:3000/app**. Para ejecutar sin Nodemon usa `npm start`.

## Roles y flujos

- **Administrador:** inicia sesión con `ADMIN_EMAIL` y `ADMIN_PASSWORD`; crea y asigna cursos a docentes, registra cuentas docentes, revisa comprobantes y aprueba inscripciones.
- **Docente:** administración le entrega una cuenta con contraseña inicial de al menos 12 caracteres. Puede crear cursos que se asignan automáticamente a sí mismo, editar o eliminar sus propios cursos y consultar/gestionar los participantes inscritos. No puede ver comprobantes ni aprobar pagos.
- **Estudiante:** crea su propia cuenta, elige un curso, adjunta el comprobante y envía la solicitud. Puede consultar o cancelar sus propias inscripciones.
- Una solicitud nueva queda `Pendiente`; solo administración puede aprobarla y cambiarla a `Inscrito`. Los comprobantes admiten PDF, JPG y PNG de hasta 5 MB.

El JWT dura una hora y el navegador lo conserva en `localStorage` para restaurar la sesión. El cliente lo envía en el encabezado `Authorization: Bearer <token>`; el token no se muestra en la interfaz. No coloques credenciales ni el secreto en el código fuente.

## Endpoints principales

Todas las respuestas son JSON salvo la descarga del comprobante. Los identificadores `:id` deben ser ObjectId válidos.

| Recurso | Método | Endpoint | Acceso |
|---|---|---|---|
| Estado | GET | `/` | Público |
| Aplicación web | GET | `/app` | Público |
| Cursos | GET | `/api/cursos` | Público |
| Curso | GET | `/api/cursos/:id` | Público |
| Cursos | POST | `/api/cursos` | Admin o docente |
| Curso | PUT | `/api/cursos/:id` | Admin; docente propietario |
| Curso | DELETE | `/api/cursos/:id` | Admin; docente propietario; sin relaciones |
| Inscritos confirmados | GET | `/api/cursos/:id/inscritos` | Público |
| Participantes del curso | GET | `/api/cursos/:id/estudiantes` | Admin o docente propietario; excluye comprobantes |
| Solicitudes pendientes del curso | GET | `/api/cursos/:id/inscripciones-pendientes` | Solo admin |
| Salones disponibles | GET | `/api/cursos/:id/salones-disponibles` | Público |
| Participantes | GET | `/api/participantes` | Admin; docente limitado a sus inscritos |
| Participante | GET | `/api/participantes/:id` | Admin; docente limitado a sus inscritos |
| Participante | POST | `/api/participantes` | Admin o docente; solo admin registra docentes |
| Participante | PUT | `/api/participantes/:id` | Admin; docente solo actualiza nombre de sus inscritos |
| Inscripciones | GET | `/api/inscripciones` | Admin/docente sin comprobantes; estudiante solo las propias |
| Inscripción | GET | `/api/inscripciones/:id` | Según rol; estudiante solo la propia |
| Inscripción | POST | `/api/inscripciones` | Estudiante autenticado; multipart con `curso_id` y `comprobante` |
| Inscripción | PATCH | `/api/inscripciones/:id/cancelar` | Estudiante propietario |
| Comprobante | GET | `/api/inscripciones/:id/comprobante` | Solo admin |
| Aprobar inscripción | PATCH | `/api/inscripciones/:id/aprobar` | Solo admin |
| Login | POST | `/api/auth/login` | Público |
| Registro estudiante | POST | `/api/auth/student/register` | Público |
| Sesión actual | GET | `/api/auth/me` | Requiere JWT |
| Salones | GET/POST | `/api/salones` | API |
| Asignaciones | GET/POST | `/api/asignaciones` | API |

Las rutas protegidas requieren `Authorization: Bearer <token>`. La aprobación cambia el estado a `Inscrito`; los conteos de estudiantes y capacidad de salones incluyen los estados `Inscrito` y `Confirmada`.

## Ejemplo: crear un curso

```http
POST http://localhost:3000/api/cursos
Content-Type: application/json
Authorization: Bearer <token>
```

```json
{
  "nombre": "Curso de ejemplo",
  "tipo": "Curso",
  "duracion_horas": 20,
  "cupo_maximo": 25,
  "modalidad": "Presencial",
  "docente_id": "ObjectId-del-docente"
}
```

## Solución de problemas

- **No inicia la API:** comprueba que `.env` contiene `MONGODB_URI` y que MongoDB está disponible.
- **Atlas rechaza la conexión:** comprueba las credenciales del usuario de base de datos, la lista de acceso IP y la URI en Atlas.
- **La página no abre:** inicia el servidor con `npm run dev` y entra en `http://localhost:3000/app`.
- **`Ruta no encontrada`:** verifica el prefijo `/api` y el método HTTP.
- **`Solicitud inválida`:** envía JSON válido, completa los campos requeridos y usa un ObjectId válido.
