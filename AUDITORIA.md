# Auditoría técnica y de experiencia de SupportOps

Fecha: 6 de noviembre de 2026

## Resultado

SupportOps pasó de una demo estática a una aplicación full-stack funcional. La versión actual conecta con PostgreSQL, autentica usuarios, aplica permisos en el servidor y ofrece gestión operativa y administrativa. La interfaz conserva el concepto neumórfico solicitado con una jerarquía más seria, responsive y transiciones suaves.

## Mejoras implementadas

| Área | Resultado |
| --- | --- |
| Autenticación | Login real, contraseñas bcrypt, sesiones HttpOnly, logout y recuperación con token temporal |
| Acceso | Administrador global, supervisor global sin administración y agente limitado a Fulfilment |
| Datos | Esquema PostgreSQL, seed idempotente, 72 tickets sintéticos, índices y consultas parametrizadas |
| Analítica | KPIs, tendencia, categorías, grupos y canales; filtros por rango, categoría y grupo |
| Operación | Filtros de cola, orden configurable, creación, avance de estado y exportación CSV |
| Administración | Alta, edición y baja de usuarios, categorías y grupos con autorización server-side |
| UI/UX | Neumorfismo accesible, tonos blancos/azules/grises, estados claros, responsive y animaciones suaves |
| Privacidad | Políticas alineadas con la arquitectura, banner reversible, minimización y consentimiento explícito |
| Seguridad | CSP/Helmet, hashes de tokens, invalidación de sesiones y bloqueo de archivos sensibles |
| Suite profesional | Kanban, calendario, carga, command palette, notificaciones, clientes, conocimiento y preferencias |
| Gestión avanzada | Conversaciones, notas internas, eventos, asignación, etiquetas, pausa de SLA, escalamiento y acciones masivas |
| Gobierno | Calendario laboral, SLA, retención, política MFA demo, contraseñas, bloqueos y backups guardados en PostgreSQL |
| Jira | Única integración visible; aviso explícito de demostración y cero tráfico a servicios externos |

## Verificación realizada

- Esquema y seed ejecutados sobre PostgreSQL 18.6 local.
- Login y sesión comprobados con los tres roles.
- Supervisor bloqueado con HTTP 403 ante rutas administrativas.
- Agente limitado a 24 tickets del grupo Fulfilment.
- Recuperación de contraseña probada de extremo a extremo y credencial demo restaurada.
- CRUD de categorías probado contra la base de datos.
- Dashboard y panel administrativo revisados en navegador, sin errores de consola.
- Vista responsive revisada a 598 px sin desbordamiento de navegación.
- Suite automatizada y auditoría de dependencias ejecutadas antes de empaquetar.
- Professional Suite revisada visualmente en navegador; tablero responsive y aviso Jira validados sin errores de consola.
- Alcance del agente comprobado también al intentar cambiar grupo o asignación desde la API avanzada.

## Riesgos pendientes para producción

- Las credenciales públicas son deliberadas para revisión; deben eliminarse en producción.
- El enlace de recuperación se muestra en pantalla; debe enviarse por un canal verificado.
- Faltan rate limiting, MFA, bitácora inmutable, CSRF adicional para escenarios cross-site complejos y bloqueo progresivo.
- El seed automático y `schema.sql` son adecuados para demo; producción necesita migraciones versionadas.
- La política SLA no contempla horario laboral, pausas, festivos ni escalamiento automático.
- Las plantillas legales necesitan identidad, contacto, jurisdicción y revisión profesional.

