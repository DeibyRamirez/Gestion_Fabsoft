# FabSoft — Plataforma de gestión de clientes, licencias y renovaciones

## 1. Propósito del documento

Este documento define la visión funcional, los módulos, los flujos de usuario y las reglas de negocio para construir la plataforma interna de FabSoft. Está dirigido al desarrollador responsable de implementarla y sirve como base para el análisis, diseño y desarrollo del MVP.

**Tecnologías definidas por el equipo:** Next.js 16 y Supabase.

Por ahora, el foco principal es entender qué debe hacer el producto y cómo deben interactuar sus usuarios. Las decisiones técnicas detalladas, la estructura del código y el diseño visual se definirán durante la implementación, respetando estas tecnologías.

---

## 2. Visión del producto

FabSoft necesita centralizar la gestión de sus clientes y de las licencias o suscripciones que administra. Algunas corresponden a productos de terceros y otras a software desarrollado por FabSoft. Estas pueden tener periodos mensuales, anuales u otras condiciones contractuales.

La plataforma no debe ser únicamente un calendario de vencimientos. Debe permitir anticipar renovaciones, asignar responsables, dar seguimiento a los clientes, conservar el historial de cada periodo y ofrecer información a otras aplicaciones mediante una API.

### Objetivos principales

- Tener una ficha centralizada de cada cliente.
- Registrar los productos, servicios y licencias asociados a cada cliente.
- Conocer la vigencia, el estado y las condiciones de cada licencia.
- Detectar con anticipación las renovaciones próximas.
- Crear y gestionar tareas de seguimiento.
- Registrar las acciones y los resultados de cada proceso de renovación.
- Consultar el historial de licencias y renovaciones.
- Permitir que los clientes consulten la información autorizada desde un portal.
- Exponer una API para que aplicaciones externas consuman datos y, con permisos adecuados, ejecuten operaciones.
- Mantener trazabilidad de los cambios importantes.

### Usuarios previstos

El equipo inicial es pequeño, aproximadamente entre 2 y 5 personas. La solución debe ser fácil de usar, sin flujos administrativos innecesariamente complejos, pero debe permitir ampliar usuarios y permisos en el futuro.

---

## 3. Alcance del MVP

### Incluido en la primera versión

1. Autenticación y gestión de acceso.
2. Roles de usuario.
3. Gestión de clientes.
4. Catálogo de productos y servicios.
5. Gestión de licencias o suscripciones por cliente.
6. Registro histórico de periodos y renovaciones.
7. Alertas de vencimiento.
8. Tareas y seguimiento comercial.
9. Dashboard operativo.
10. Portal de clientes con acceso limitado a su propia información.
11. API versionada para integraciones externas.
12. Registro de auditoría de acciones importantes.

### Fuera del alcance inicial, salvo decisión posterior

- Procesamiento de pagos en línea.
- Facturación electrónica.
- Contabilidad completa.
- Renovación automática directamente con proveedores externos.
- Integraciones específicas con proveedores como Microsoft, Google u otros.
- Aplicación móvil nativa.
- Automatizaciones complejas de marketing.
- Reportes financieros avanzados.

La estructura funcional puede prepararse para futuras ampliaciones, pero no se debe añadir complejidad innecesaria al MVP.

---

## 4. Conceptos importantes del negocio

Para evitar confusiones, la aplicación debe distinguir claramente los siguientes conceptos.

### Cliente

Empresa o persona que compra, contrata o utiliza un producto o servicio administrado por FabSoft.

### Producto o servicio

Elemento del catálogo que FabSoft administra. Puede ser:

- **Producto de terceros:** por ejemplo, una licencia comercial, un dominio o un servicio de hosting.
- **Producto propio:** software desarrollado o comercializado por FabSoft.
- **Servicio recurrente:** soporte, mantenimiento u otro servicio contratado periódicamente, si se decide incluirlo.

El catálogo describe el producto de forma general. No contiene las fechas particulares de cada cliente.

### Licencia o suscripción

Contrato, licencia o suscripción concreta de un cliente asociada a un producto o servicio. Incluye fechas, precio, periodicidad, condiciones y estado. Un mismo producto puede tener muchas suscripciones de diferentes clientes.

### Periodo de vigencia

Intervalo específico durante el cual una suscripción está vigente. Cada renovación debe conservar el periodo anterior y crear o registrar el nuevo periodo sin sobrescribir el historial.

### Renovación

Proceso de seguimiento que determina si una suscripción se renueva, no se renueva o sigue pendiente. Una solicitud de renovación no equivale a una renovación confirmada ni demuestra que se haya recibido el pago.

### Tarea

Acción que debe realizar una persona del equipo, por ejemplo contactar a un cliente, enviar una propuesta o verificar un pago.

### Alerta

Aviso generado por una regla de anticipación o por un evento relevante. Una alerta puede originar una tarea, pero ambos conceptos no son lo mismo: la alerta informa; la tarea representa una acción que debe realizarse.

---

## 5. Roles y permisos

### Administrador de FabSoft

Puede:

- Crear y editar usuarios internos.
- Gestionar clientes, catálogo y suscripciones.
- Configurar reglas de alertas.
- Consultar y gestionar todas las tareas y renovaciones.
- Crear y revocar integraciones y credenciales de API.
- Consultar auditoría y configuración general.

### Operador de FabSoft

Puede, según los permisos que se definan:

- Consultar y actualizar clientes.
- Crear y actualizar suscripciones.
- Gestionar tareas y seguimientos.
- Registrar resultados de renovación.
- Consultar alertas y el dashboard operativo.

En el MVP se puede empezar con permisos sencillos, pero las operaciones sensibles deben estar restringidas al administrador.

### Usuario cliente

Puede:

- Iniciar y cerrar sesión.
- Consultar los datos de su organización que FabSoft haya autorizado.
- Ver sus licencias, estados, fechas e historial visible.
- Consultar solicitudes de renovación.
- Crear una solicitud de renovación o contactar a FabSoft.

No puede ver datos de otros clientes, modificar precios o condiciones contractuales, confirmar pagos ni cambiar el estado real de una licencia, salvo que en una fase futura se diseñe explícitamente esa capacidad.

### Aplicación externa

Cada integración tiene una identidad propia, credenciales y permisos específicos. No debe usar las credenciales de un usuario humano. Solo puede consultar o modificar los recursos permitidos para esa integración.

**Regla de seguridad:** los permisos deben comprobarse en el servidor. Ocultar botones en la interfaz no es suficiente. El backend debe impedir que un usuario o integración consulte o modifique recursos de otro cliente sin autorización.

---

## 6. Módulos funcionales

### 6.1 Dashboard operativo

Debe ayudar al equipo a responder: “¿Qué requiere atención hoy?”

Mostrar como mínimo:

- Cantidad de suscripciones activas.
- Suscripciones que vencen en los próximos 30, 15 y 7 días.
- Suscripciones vencidas.
- Renovaciones pendientes de respuesta.
- Tareas vencidas y tareas próximas.
- Solicitudes de renovación nuevas.
- Actividad reciente relevante.

Cada indicador debe permitir acceder a la lista filtrada que lo compone. Las cifras deben derivarse de los registros reales y de reglas claramente definidas, no mantenerse manualmente.

### 6.2 Gestión de clientes

Permitir:

- Crear, consultar y editar un cliente.
- Registrar nombre o razón social, identificación si aplica, estado, correo y teléfono de contacto.
- Registrar uno o varios contactos si el caso lo requiere.
- Asignar un responsable interno.
- Consultar todas las suscripciones del cliente.
- Consultar tareas, solicitudes y el historial relacionado.
- Añadir notas internas de seguimiento, si se incluyen en el MVP.

Reglas:

- Evitar duplicados evidentes, por ejemplo mediante identificación fiscal cuando esté disponible.
- No eliminar físicamente un cliente que tenga historial contractual. Preferir desactivarlo o archivarlo.
- La desactivación de un cliente no debe borrar ni alterar sus registros históricos.

### 6.3 Catálogo de productos y servicios

Permitir crear y mantener productos con:

- Nombre.
- Descripción.
- Tipo: tercero, propio o servicio, según el alcance adoptado.
- Proveedor o fabricante, cuando aplique.
- Estado: activo o inactivo.
- Información de referencia que ayude al equipo a identificarlo.

El producto del catálogo no determina por sí solo el precio ni la vigencia de una suscripción concreta. Esos valores pueden variar por cliente y contrato.

### 6.4 Gestión de suscripciones o licencias

Cada registro debe incluir, como mínimo:

- Cliente asociado.
- Producto o servicio asociado.
- Identificador o referencia contractual, si existe.
- Fecha de inicio.
- Fecha de vencimiento del periodo actual.
- Periodicidad: mensual, anual u otra periodicidad admitida.
- Precio de venta al cliente y moneda.
- Costo de proveedor, si aplica y si FabSoft desea llevar ese dato.
- Condiciones de renovación.
- Responsable interno.
- Estado de la suscripción.
- Notas y documentos de referencia, si se habilitan.
- Fecha de creación y última actualización.

Estados de negocio recomendados:

- **Pendiente de activación:** registrada, pero todavía no confirmada como activa.
- **Activa:** vigente y habilitada según el registro de FabSoft.
- **En renovación:** el equipo está gestionando la continuidad.
- **Vencida:** terminó el periodo de vigencia y no existe una renovación confirmada que lo extienda.
- **Cancelada:** se canceló según las condiciones correspondientes.
- **No renovada:** se decidió no continuar después del periodo correspondiente.

La implementación puede ajustar los nombres, pero debe evitar estados ambiguos o contradictorios. El estado no debe cambiar solo porque alguien abra una pantalla. Debe cambiar por una operación explícita o por una regla automática definida.

**Importante:** vigencia, pago y estado comercial son dimensiones distintas. Una suscripción puede estar vigente pero tener un pago pendiente, o estar vencida mientras se resuelve una renovación. No se debe inferir el estado de pago a partir de la fecha de vencimiento.

### 6.5 Historial de periodos y renovaciones

Cuando se renueva una suscripción:

1. Registrar el resultado de la renovación.
2. Conservar el periodo anterior.
3. Registrar el nuevo periodo con fechas y condiciones aplicables.
4. Actualizar la fecha de vencimiento actual.
5. Guardar quién realizó el cambio y cuándo.
6. Cerrar o actualizar las tareas y alertas relacionadas.
7. Registrar el resultado comercial: renovada, no renovada o pendiente.

No se deben sobrescribir las fechas anteriores sin conservar un historial consultable.

Si cambia el precio o la periodicidad, se debe guardar el valor correspondiente a cada periodo, para que el historial no muestre condiciones actuales como si siempre hubieran existido.

### 6.6 Renovaciones y tareas

Una tarea debe permitir registrar:

- Cliente y suscripción relacionados.
- Tipo de acción.
- Responsable.
- Fecha de vencimiento de la tarea.
- Prioridad.
- Estado: pendiente, en progreso, completada o cancelada.
- Notas de seguimiento.
- Fecha de finalización y resultado, cuando corresponda.

Ejemplos de tareas:

- Contactar al cliente.
- Preparar o enviar una propuesta.
- Confirmar condiciones de renovación.
- Verificar una orden de compra o pago.
- Confirmar que una licencia fue renovada.
- Registrar el motivo de no renovación.

El equipo debe poder filtrar tareas por responsable, fecha, prioridad, estado, cliente y suscripción.

### 6.7 Alertas de vencimiento

Política inicial sugerida, configurable:

- 30 días antes del vencimiento: preparar la renovación.
- 15 días antes: contactar al cliente.
- 7 días antes: hacer seguimiento.
- 1 día antes: alertar sobre vencimiento inminente.
- En la fecha de vencimiento: comprobar el estado.
- Después del vencimiento: alertar que la suscripción requiere revisión.

Reglas:

- Las alertas deben calcularse usando la fecha de vencimiento de la suscripción y la zona horaria de negocio definida.
- No generar alertas para suscripciones canceladas o no renovables, salvo que una regla específica lo requiera.
- Evitar generar varias alertas idénticas para la misma suscripción y fecha de anticipación.
- Registrar el estado de la notificación: pendiente, enviada, fallida o cancelada.
- Si cambia la fecha de vencimiento, recalcular o cancelar las alertas futuras que ya no correspondan.
- Si la suscripción se renueva o cancela, revisar las alertas pendientes y cerrarlas o actualizarlas.
- Un fallo al enviar una notificación no debe eliminar la alerta; debe permitir reintentar y registrar el error.
- El sistema debe mostrar alertas dentro de la aplicación. El envío por correo u otros canales se puede habilitar según el alcance acordado.

### 6.8 Portal de clientes

El portal debe permitir a cada usuario cliente:

- Ver un resumen de sus suscripciones.
- Consultar las fechas de inicio y vencimiento.
- Consultar estados y condiciones autorizadas.
- Ver su historial de periodos y renovaciones.
- Crear una solicitud de renovación.
- Consultar el estado de esa solicitud.
- Ver el canal de contacto de FabSoft.

Al crear una solicitud, debe registrarse quién la creó, cuándo, a qué suscripción corresponde y qué desea el cliente. La solicitud debe quedar visible para el equipo interno y generar una tarea o elemento de seguimiento.

El portal no debe permitir que el cliente modifique directamente la fecha de vencimiento, el precio, el proveedor, el estado de pago ni la confirmación de renovación.

### 6.9 API para aplicaciones externas

La plataforma debe exponer una API versionada, por ejemplo `/api/v1`, para que otros sistemas puedan consumir información sin conectarse directamente a la base de datos.

Endpoints iniciales a considerar:

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/api/v1/clients` | Consultar clientes dentro del alcance autorizado. |
| `GET` | `/api/v1/clients/{id}` | Consultar el detalle de un cliente autorizado. |
| `GET` | `/api/v1/products` | Consultar el catálogo de productos. |
| `GET` | `/api/v1/subscriptions` | Consultar suscripciones con filtros y paginación. |
| `GET` | `/api/v1/subscriptions/{id}` | Consultar una suscripción concreta. |
| `GET` | `/api/v1/subscriptions/expiring` | Consultar suscripciones próximas a vencer. |
| `GET` | `/api/v1/renewal-tasks` | Consultar tareas permitidas para la integración. |
| `POST` | `/api/v1/renewal-requests` | Registrar una solicitud de renovación. |

Las operaciones de escritura adicionales se definirán según los casos de uso reales. No se debe permitir que una integración cree o cambie cualquier recurso por defecto.

Requisitos funcionales de la API:

- Autenticación y autorización por integración.
- Permisos específicos de lectura y escritura.
- Respuestas y errores consistentes.
- Paginación y filtros para colecciones.
- Versionado.
- Registro de operaciones relevantes.
- Revocación de credenciales.
- Límites de consumo por integración.
- Documentación de los endpoints y ejemplos de uso.
- Protección contra acceso cruzado entre clientes.
- Idempotencia para operaciones de escritura en las que los reintentos puedan duplicar acciones.

A futuro se pueden añadir webhooks para notificar a sistemas externos cuando una suscripción esté próxima a vencer, se renueve o cambie de estado. No es necesario implementar webhooks en el primer MVP si no existe un consumidor que los necesite.

### 6.10 Auditoría

Registrar las acciones importantes, por ejemplo:

- Creación o modificación de clientes.
- Creación y cambios de suscripciones.
- Renovaciones y cancelaciones.
- Cambios en fechas, precio o periodicidad.
- Cambios de permisos y usuarios.
- Creación o revocación de credenciales API.
- Operaciones de escritura realizadas por integraciones.

Cada registro debería incluir actor, acción, recurso afectado, fecha y datos relevantes del cambio, evitando almacenar secretos o información sensible innecesaria.

---

## 7. Flujos de usuario detallados

### Flujo A: crear un cliente y registrar una licencia

1. El usuario interno inicia sesión.
2. Entra al módulo de clientes.
3. Busca al cliente para comprobar que no exista.
4. Si no existe, registra sus datos.
5. Abre la ficha del cliente.
6. Selecciona crear suscripción.
7. Selecciona un producto del catálogo o crea el producto si tiene permiso.
8. Completa periodicidad, fechas, precio, responsable y condiciones.
9. El sistema valida los campos y las reglas.
10. El usuario confirma el registro.
11. La suscripción queda creada con el estado adecuado.
12. El sistema calcula las alertas futuras y muestra la suscripción en la ficha del cliente.
13. Se registra la acción en la auditoría.

**Resultado esperado:** cliente y suscripción quedan consultables y el sistema conoce su próximo vencimiento.

### Flujo B: atender una renovación próxima

1. El sistema detecta una suscripción que entra en el periodo de anticipación.
2. Crea o activa la alerta correspondiente sin duplicarla.
3. Se muestra en el dashboard y, si corresponde, se asigna una tarea a un responsable.
4. El responsable abre la tarea y consulta el contexto del cliente.
5. Contacta al cliente y registra el resultado.
6. Si el cliente acepta, se confirma la renovación y se registra el nuevo periodo.
7. Si el cliente rechaza, se registra el motivo y el resultado.
8. Si no responde, la tarea queda pendiente con una próxima acción.
9. El sistema actualiza las alertas y las tareas relacionadas.
10. La actividad queda registrada en el historial.

### Flujo C: solicitud desde el portal del cliente

1. El cliente inicia sesión.
2. Consulta sus suscripciones.
3. Selecciona una suscripción.
4. Solicita renovación y añade un comentario opcional.
5. El sistema registra la solicitud con estado “pendiente de revisión”.
6. El equipo interno recibe una alerta o tarea.
7. Un operador revisa la solicitud y contacta al cliente.
8. El equipo confirma la renovación o registra el resultado correspondiente.
9. El cliente puede consultar el estado actualizado de su solicitud.

### Flujo D: una aplicación consulta vencimientos por API

1. Un administrador crea una integración.
2. Le asigna los permisos mínimos necesarios.
3. La aplicación externa recibe credenciales seguras.
4. La aplicación se autentica y consulta el endpoint de vencimientos.
5. El sistema valida credenciales, permisos y alcance de datos.
6. Devuelve únicamente la información autorizada, con paginación y formato documentado.
7. La consulta se registra según la política de auditoría y límites de consumo.

### Flujo E: corregir una fecha de vencimiento

1. Un usuario autorizado abre la suscripción.
2. Edita la fecha con un motivo de cambio.
3. El sistema valida que la modificación sea coherente.
4. Se conserva el valor anterior en la auditoría.
5. Se recalculan las alertas futuras.
6. Se cancelan o actualizan las alertas que ya no correspondan.
7. El sistema muestra la nueva fecha y deja trazabilidad.

---

## 8. Reglas de negocio que deben respetarse

1. Una suscripción pertenece a un cliente y referencia un producto o servicio.
2. Un producto puede tener muchas suscripciones.
3. La fecha de vencimiento representa el final del periodo vigente y debe definirse con una convención consistente.
4. Los periodos anteriores no se sobrescriben cuando hay una renovación.
5. Una solicitud de renovación no equivale a una renovación confirmada.
6. Una renovación confirmada no implica automáticamente que el pago esté recibido.
7. El estado de vigencia, el estado de pago y el estado de seguimiento deben modelarse por separado cuando se necesiten.
8. Las alertas deben ser idempotentes: la misma regla no puede producir duplicados para una misma suscripción y periodo.
9. Al modificar fechas, periodicidad o estado, se deben revisar las alertas y tareas relacionadas.
10. Las licencias canceladas o no renovables no deben continuar generando alertas de renovación, salvo una excepción configurada.
11. El cliente solo puede consultar los datos de su propia organización y los campos que tenga autorizados.
12. Las aplicaciones externas solo pueden realizar operaciones cubiertas por sus permisos.
13. Los cambios sensibles deben quedar auditados.
14. No eliminar físicamente registros que sean necesarios para el historial contractual o de auditoría.
15. La lógica de negocio debe ejecutarse en el servidor y no depender únicamente de validaciones de interfaz.

---

## 9. Modelo de información conceptual

La siguiente lista representa las entidades funcionales iniciales. El desarrollador podrá ajustar nombres y relaciones durante el diseño de la base de datos, manteniendo las reglas de negocio.

### `clients`

- Identificador.
- Nombre o razón social.
- Identificación fiscal, si aplica.
- Estado.
- Datos de contacto.
- Responsable interno.
- Fechas de creación y actualización.

### `client_contacts` (si se requieren múltiples contactos)

- Identificador.
- Cliente asociado.
- Nombre.
- Correo.
- Teléfono.
- Cargo o función.
- Indicador de contacto principal.

### `products`

- Identificador.
- Nombre.
- Descripción.
- Tipo de producto.
- Proveedor, si aplica.
- Estado.
- Fechas de creación y actualización.

### `subscriptions`

- Identificador.
- Cliente asociado.
- Producto asociado.
- Referencia contractual.
- Fecha de inicio.
- Fecha de vencimiento actual.
- Periodicidad.
- Precio de venta.
- Moneda.
- Costo de proveedor, si aplica.
- Condición de renovación.
- Estado de vigencia.
- Responsable.
- Notas.
- Fechas de creación y actualización.

### `subscription_periods`

- Identificador.
- Suscripción asociada.
- Fecha de inicio del periodo.
- Fecha de fin del periodo.
- Precio aplicable al periodo.
- Moneda.
- Resultado del periodo o renovación.
- Fecha de confirmación.
- Usuario que confirmó.
- Referencia de contrato o documento, si aplica.

### `renewal_requests`

- Identificador.
- Suscripción asociada.
- Cliente que realiza la solicitud.
- Fecha de solicitud.
- Comentario.
- Estado de la solicitud.
- Responsable interno.
- Resultado y fecha de resolución.

### `tasks`

- Identificador.
- Tipo de tarea.
- Cliente y suscripción relacionados.
- Responsable.
- Prioridad.
- Fecha objetivo.
- Estado.
- Notas.
- Fecha de finalización y resultado.

### `notifications`

- Identificador.
- Suscripción y tarea relacionadas, cuando aplique.
- Tipo de alerta.
- Fecha programada.
- Canal.
- Estado de envío.
- Número de intentos.
- Último error, si aplica.
- Fecha de envío.

### `users` / perfiles y roles

- Identificador de usuario vinculado al sistema de autenticación.
- Rol.
- Cliente asociado para usuarios del portal, cuando corresponda.
- Estado de acceso.
- Fechas de creación y actualización.

### `integrations`

- Identificador.
- Nombre de la integración.
- Descripción.
- Estado.
- Permisos autorizados.
- Fecha de creación y última utilización.

### `api_credentials`

- Identificador.
- Integración asociada.
- Referencia o hash de la credencial, según el mecanismo elegido.
- Fecha de creación.
- Fecha de expiración, si aplica.
- Fecha de revocación.
- Último uso.

Nunca almacenar secretos de API en texto plano.

### `audit_logs`

- Identificador.
- Actor.
- Tipo de actor: usuario o integración.
- Acción.
- Tipo e identificador del recurso.
- Fecha y hora.
- Resumen del cambio, sin secretos ni datos sensibles innecesarios.

---

## 10. Criterios de aceptación del MVP

El MVP puede considerarse funcional cuando:

- Un administrador puede crear usuarios internos y gestionar clientes.
- Un usuario autorizado puede registrar productos y suscripciones.
- Se puede identificar claramente qué suscripciones están activas, próximas a vencer, vencidas o canceladas.
- Cada suscripción tiene una fecha de vencimiento y un historial de periodos.
- El sistema genera alertas conforme a reglas configuradas sin duplicarlas.
- El equipo puede crear, asignar, filtrar y cerrar tareas de seguimiento.
- Una renovación conserva el periodo anterior y registra el nuevo.
- El portal de clientes muestra únicamente la información autorizada de ese cliente.
- Un cliente puede solicitar una renovación y el equipo puede gestionar la solicitud.
- Una integración externa autorizada puede consultar la API.
- La API impide accesos no autorizados y documenta sus operaciones.
- Los cambios sensibles quedan auditados.
- Los errores al enviar alertas no hacen perder el registro y pueden gestionarse.
- Las listas de clientes, suscripciones y tareas tienen filtros y paginación cuando sea necesario.

---

## 11. Orden sugerido de implementación

### Etapa 1 — Base funcional

- Definir reglas y estados finales.
- Autenticación y roles.
- Clientes y catálogo de productos.
- Suscripciones y validaciones básicas.

### Etapa 2 — Operación y renovaciones

- Historial de periodos.
- Tareas y responsables.
- Motor de alertas y registro de envíos.
- Dashboard operativo.

### Etapa 3 — Portal de clientes

- Acceso del cliente.
- Visualización de suscripciones e historial.
- Solicitudes de renovación.
- Gestión interna de las solicitudes.

### Etapa 4 — API e integraciones

- API versionada.
- Autenticación de integraciones.
- Permisos por integración.
- Filtros, paginación, documentación y auditoría.
- Pruebas de seguridad y de aislamiento de clientes.

El orden puede ajustarse si existe una integración prioritaria, pero no se debe dejar para el final el diseño de permisos y el aislamiento de datos.

---

## 12. Consideraciones de implementación con Next.js 16 y Supabase

Estas indicaciones son técnicas de alto nivel; no sustituyen el diseño funcional anterior.

- Utilizar Next.js 16 para la aplicación web y sus rutas de servidor/API según la arquitectura elegida.
- Utilizar Supabase para PostgreSQL y autenticación, y evaluar Storage si se necesitan documentos adjuntos.
- Aplicar políticas de seguridad a nivel de fila (Row Level Security, RLS) para impedir el acceso cruzado entre clientes.
- No exponer la clave `service_role` ni secretos de API en el navegador.
- Las operaciones privilegiadas deben ejecutarse exclusivamente en un entorno de servidor seguro, con autorización explícita.
- No confiar solo en la interfaz para autorizar acciones.
- Mantener reglas de renovación y generación de alertas en procesos de servidor fiables, con controles contra duplicados.
- No asumir que una tarea programada se ejecutará exactamente una vez; diseñar los procesos para soportar reintentos de forma segura.
- Documentar la API y validar entradas y permisos.
- Mantener separación entre entornos de desarrollo, pruebas y producción.

---

## 13. Preguntas funcionales pendientes

Antes de cerrar el diseño de base de datos y desarrollar todos los flujos, el equipo debe confirmar:

1. ¿FabSoft necesita registrar pagos y cartera desde el MVP, o solo precios, costos y renovaciones?
2. ¿Qué monedas se utilizarán?
3. ¿La mayoría de licencias tienen renovación manual o existen casos reales de renovación automática?
4. ¿Las alertas se mostrarán solo dentro de la plataforma o también se enviarán por correo?
5. ¿Un cliente podrá tener varios usuarios en el portal?
6. ¿Las aplicaciones externas solo consultarán información al principio o también deberán crear y modificar recursos?
7. ¿Se necesita adjuntar contratos, facturas o comprobantes?
8. ¿Quién debe recibir las alertas y cómo se asignará el responsable de cada renovación?

Estas preguntas pueden resolverse durante el análisis sin bloquear la construcción inicial de los módulos básicos.

---

## 14. Resultado esperado

La plataforma debe convertirse en la fuente central de información de FabSoft para clientes, licencias y renovaciones. El equipo debe poder anticipar vencimientos y actuar a tiempo; los clientes deben consultar únicamente la información que les corresponde; y otras aplicaciones deben integrarse mediante una API segura y documentada.

La prioridad del MVP es **visibilidad, seguimiento, trazabilidad y seguridad**. La automatización avanzada y las funciones financieras completas pueden añadirse cuando el uso real del sistema confirme su necesidad.
