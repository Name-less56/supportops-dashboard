# SupportOps Dashboard

Consola full-stack de operaciones de soporte con autenticación, control de acceso por rol, PostgreSQL, analítica, administración y una suite profesional de productividad.

## Inicio rápido

Requiere Node.js 18+ y Docker Desktop.

```bash
npm install
npm run db:up
npm start
```

Abrir `http://localhost:4173`. La primera ejecución crea el esquema y carga 72 tickets sintéticos, tres grupos, seis categorías y los tres usuarios demo.

Si ya tienes PostgreSQL, copia `.env.example`, define `DATABASE_URL` y ejecuta `npm start`. El servidor aplica `schema.sql` automáticamente; el usuario configurado necesita permisos para crear tablas e índices en la base elegida.

## Cuentas de demostración

| Rol | Usuario | Contraseña | Alcance |
| --- | --- | --- | --- |
| Administrador | `admin@supportops.demo` | `AdminDemo!2026` | Todos los tickets, analítica y panel administrativo completo |
| Supervisor | `lead@supportops.demo` | `LeadDemo!2026` | Todos los tickets, analítica y workflow; sin administración |
| Agente | `agent@supportops.demo` | `AgentDemo!2026` | Sólo el grupo Fulfilment y actualización de sus tickets |

Las credenciales también aparecen en el login y cada tarjeta las autocompleta. El restablecimiento de contraseña genera un enlace temporal visible en la propia demo, sin depender de correo electrónico.

## Funcionalidades

- Login real con contraseña bcrypt, cookie de sesión HttpOnly y cierre de sesión.
- Recuperación de contraseña con token de un solo uso y expiración de 20 minutos.
- RBAC en el servidor para administrador, supervisor y agente; el alcance del agente se limita por grupo en las consultas SQL.
- Panel analítico con volumen, activos, SLA vencidos, tasa de resolución, tiempo medio, tendencia temporal y desglose por categoría, grupo y canal.
- Filtros independientes por fechas, categoría, grupo, estado y prioridad; orden por SLA, fecha, prioridad o estado.
- Creación y avance de tickets, exportación CSV de la vista actual y protección contra fórmulas de hoja de cálculo.
- Administración CRUD de usuarios, categorías y grupos, protegida por rol.
- Professional Suite con command palette, centro de notificaciones, Kanban con drag-and-drop, calendario y vista de carga.
- Detalle de ticket con conversación pública, notas internas, historial, asignación, etiquetas, pausa de SLA y escalamiento.
- Acciones masivas, perfiles sintéticos de clientes, base de conocimiento y reglas de automatización simulables.
- Reporte ejecutivo con primera respuesta, resolución, reaperturas, CSAT, demanda horaria, productividad y previsión.
- Centro de seguridad, sesiones visibles, eventos de acceso y preferencias de tema, densidad y movimiento.
- Integración visual exclusiva con Jira. El botón muestra claramente que es una demostración y no envía datos externos.
- Diseño neumórfico responsive en blanco, azules y grises, con transiciones suaves y respeto a `prefers-reduced-motion`.
- Políticas de privacidad, términos, cookies, banner de consentimiento y consentimiento explícito del formulario.
- Sin fuentes, píxeles, analítica ni SDKs de terceros en el navegador.

## Arquitectura

```text
server.mjs             API Express, autenticación, RBAC, consultas y seed
schema.sql             Esquema PostgreSQL e índices
docker-compose.yml     PostgreSQL local en el puerto 55432
index.html / app.mjs   Dashboard y analítica
login.*                Acceso y credenciales demo
forgot-password.*      Solicitud de restablecimiento
reset-password.*       Cambio de contraseña
admin.*                Administración del workspace
suite.*                Suite profesional, Kanban, clientes, conocimiento, automatización, reportes y Jira
professional.css       Sistema visual neumórfico
fullstack.css          Componentes full-stack y animaciones
suite.css              Componentes, vistas responsive y tema oscuro de la suite
core.mjs               Utilidades puras de SLA y CSV
tests/                  Pruebas de lógica, privacidad y arquitectura
```

## Variables de entorno

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://supportops:supportops_dev_2026@localhost:55432/supportops` | Conexión PostgreSQL |
| `PORT` | `4173` | Puerto HTTP |
| `NODE_ENV` | `development` | En producción activa la marca `Secure` de la cookie |

En producción usa credenciales únicas mediante un gestor de secretos, TLS, migraciones versionadas, copias de seguridad y un servicio de email real para recuperación.

## Pruebas

```bash
npm test
npm audit --omit=dev
```

## Privacidad y producción

Los datos incluidos son ficticios. No introduzcas información personal o sensible. Las políticas son plantillas de demostración y necesitan identidad legal, jurisdicción, contacto, encargados y revisión jurídica antes de publicar un servicio real. Consulta `PRIVACY_UX_AUDIT.md` y `AUDITORIA.md` para el detalle.

Developed by: Seth Castañeda

