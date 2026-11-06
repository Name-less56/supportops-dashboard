# Auditoría de privacidad, SDKs y patrones de interfaz

Fecha: 6 de noviembre de 2026

## Resultado ejecutivo

La aplicación usa PostgreSQL para cuentas y tickets, pero mantiene la minimización propia de una demo: el dataset es sintético y no se requieren datos reales de clientes. No se encontraron SDKs, scripts, fuentes, iframes, píxeles, analítica o contenido de terceros en el navegador.

## Inventario de datos

| Dato | Finalidad | Ubicación | Retención |
| --- | --- | --- | --- |
| Usuario, nombre mostrado, hash de contraseña, rol, grupo y estado | Autenticación y acceso | PostgreSQL | Hasta cambio o eliminación administrativa |
| Asunto, descripción, categoría, grupo, prioridad, canal, estado y fechas | Gestión y analítica de tickets | PostgreSQL | Hasta eliminación o reinicio de la demo |
| Hash de sesión | Mantener acceso autenticado | PostgreSQL + cookie opaca HttpOnly | Máximo 8 horas o cierre de sesión |
| Hash de restablecimiento | Cambiar contraseña | PostgreSQL | 20 minutos o primer uso |
| `supportops-consent-v1` | Recordar la elección del banner | `localStorage` | Hasta borrar los datos del sitio |
| Preferencias de tema, densidad y movimiento | Personalizar la interfaz | `localStorage` | Sólo con consentimiento de preferencias |

El formulario pide únicamente datos operativos ficticios y exige confirmar que no se introducirán datos personales o sensibles.

## Auditoría de SDKs y dependencias

- Scripts, estilos y fuentes externas en el cliente: ninguno.
- Analítica, publicidad, píxeles, iframes o WebSockets de terceros: ninguno.
- SDKs de terceros ejecutados en el navegador: ninguno.
- Llamadas del cliente: sólo a la API del mismo origen.
- Dependencias del servidor: Express, `pg`, bcryptjs y Helmet, instaladas localmente; no transmiten tickets a servicios SaaS.
- Base de datos: PostgreSQL configurado por el operador.

Riesgo residual: el host, proxy y proveedor de base de datos pueden generar logs técnicos. Deben inventariarse y documentarse antes de producción.

## Seguridad y acceso

- Contraseñas con bcrypt y coste 11; nunca se devuelven al navegador.
- Tokens de sesión y recuperación aleatorios, almacenados sólo como SHA-256.
- Cookie `supportops_session` HttpOnly, SameSite=Strict y de ocho horas; `Secure` en producción.
- Consultas parametrizadas y alcance de grupo impuesto por el servidor.
- Panel administrativo protegido por rol, no sólo oculto en la interfaz.
- Content Security Policy y cabeceras Helmet.
- Recuperar contraseña invalida todas las sesiones existentes del usuario.
- Comentarios, eventos, reglas, configuración de gobierno y perfiles sintéticos permanecen en PostgreSQL.
- Jira es una interfaz de demostración: el botón no envía solicitudes ni datos a Jira.

## Patrones oscuros

- Las opciones del banner tienen el mismo peso visual y ninguna está preseleccionada.
- Rechazar preferencias no bloquea el uso; la cookie de sesión se describe como estrictamente necesaria.
- El consentimiento puede revisarse desde el pie de página.
- No hay urgencia falsa, escasez, confirmshaming, consentimiento agrupado ni costes ocultos.
- Las credenciales demo y el alcance de cada rol se explican antes de entrar.
- La casilla del formulario está separada, vacía por defecto y describe el propósito exacto.

## Antes de producción

1. Sustituir cuentas y contraseñas públicas, habilitar TLS y usar secretos administrados.
2. Identificar al responsable, contacto, jurisdicción, base legal y plazos de conservación.
3. Documentar hosting, logs, backups, encargados y transferencias internacionales.
4. Añadir rate limiting, MFA para administradores, auditoría de cambios y rotación de sesiones.
5. Integrar un proveedor de email aprobado para recuperación sin revelar tokens en pantalla.
6. Repetir la auditoría al añadir cualquier SDK, integración o almacenamiento.
7. Obtener revisión jurídica y pruebas de seguridad independientes.

