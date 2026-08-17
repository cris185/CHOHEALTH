# CHOHEALTH

Una plataforma de salud full-stack que conecta pacientes y hospitales.

Idioma: [English](README.md) | **Español**

![Django](https://img.shields.io/badge/Django-6-092E20?logo=django&logoColor=white)
![DRF](https://img.shields.io/badge/DRF-REST%20API-A30000)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Producción-4169E1?logo=postgresql&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-Pagos-635BFF?logo=stripe&logoColor=white)
![PayPal](https://img.shields.io/badge/PayPal-Pagos-003087?logo=paypal&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000)

---

## Índice

1. [Planteamiento del problema](#planteamiento-del-problema)
2. [Decisiones arquitectónicas](#decisiones-arquitectónicas)
3. [Reglas de negocio](#reglas-de-negocio)
4. [Arquitectura del sistema](#arquitectura-del-sistema)
5. [Esquema de base de datos](#esquema-de-base-de-datos)
6. [Capacidades por rol](#capacidades-por-rol)
7. [Limitaciones conocidas y comportamiento simulado](#limitaciones-conocidas-y-comportamiento-simulado)
8. [Stack tecnológico](#stack-tecnológico)
9. [Roadmap](#roadmap)
10. [Puesta en marcha](#puesta-en-marcha)
11. [Aviso](#aviso)

---

## Planteamiento del problema

Reservar una cita médica, surtir una receta y pagar por la atención suelen ser tres experiencias desconectadas para un paciente: una llamada para agendar, un papel para la farmacia, y un portal aparte (o ninguno) para ver la factura. CHOHEALTH está construido para unificar ese flujo en un solo producto: el paciente reserva una cita, el doctor genera un historial médico y una receta durante la consulta, el paciente la surte a través de una farmacia integrada con seguimiento de entrega, y cada uno de esos pasos genera una factura consistente y auditable — todo en una sola sesión autenticada, en el idioma del paciente.

El objetivo de ingeniería detrás del proyecto no fue construir otro demo CRUD, sino practicar las partes del software de salud que no perdonan atajos: evitar que un doctor quede doble-reservado, mantener un libro contable que no pueda desviarse silenciosamente de la realidad, reconciliar dos pasarelas de pago distintas contra el mismo modelo de facturación, y hacer cumplir quién puede ver o hacer qué.

Este es un proyecto de portafolio activo, no un producto terminado — ver [Roadmap](#roadmap).

---

## Decisiones arquitectónicas

| Decisión | Justificación |
|---|---|
| Django + DRF para la API | ORM maduro con restricciones reales a nivel de base de datos (no solo validación en el serializer), y un admin completo (Jazzmin) que cubre herramientas internas/de staff sin construir una app de administración aparte. |
| `Invoice` polimórfica mediante dos campos uno-a-uno opcionales más un `CheckConstraint`, en lugar de una foreign key genérica | Mantiene integridad referencial y joins SQL normales sobre `Invoice.appointment` / `Invoice.medicine_order`, mientras que una restricción XOR a nivel de base de datos hace estructuralmente imposible facturar ambos objetivos — o ninguno — desde la misma factura, incluso si una vista futura tiene un bug. |
| Prevención de conflictos de reserva forzada a nivel de base de datos, no solo en la lógica de las vistas | Una restricción única condicional sobre `(doctor, fecha)` es la última línea de defensa contra una condición de carrera donde dos pacientes pagan por el mismo horario con milisegundos de diferencia. Las validaciones a nivel de aplicación corren primero para dar un error rápido y amigable; la restricción es lo que realmente garantiza corrección bajo concurrencia. |
| Checkout hospedado (Stripe Checkout, redirección de PayPal) como la vía de pago principal; Stripe Elements solo para tarjetas guardadas | El checkout hospedado mantiene el alcance de cumplimiento PCI-DSS del lado de la pasarela, no de la aplicación. Elements se usa de forma acotada, solo para el flujo (guardar una tarjeta para después) donde una redirección hospedada sería peor experiencia. |
| Un único webhook de Stripe compartido para citas y pedidos de farmacia, enrutado por metadata | Evita duplicar la verificación de firma del webhook y el manejo de eventos para dos tipos de entidad facturable; el modelo de factura/pago ya los trata de forma polimórfica, así que el webhook refleja eso. |
| El rol se guarda en el usuario (`user_type`) pero nunca se confía en él solo para autorización | Los permisos custom de DRF (`IsDoctor`, `IsPatient`) verifican el rol **y** que el objeto de perfil relacionado realmente exista. Un usuario que declara un rol sin un perfil correspondiente no está autorizado — cerrando un hueco que una verificación ingenua de `request.user.user_type == 'Doctor'` dejaría abierto. |
| Calificación del doctor desnormalizada, mantenida en sincronía vía señales | El listado/búsqueda de doctores es una ruta de lectura caliente; recalcular un promedio en cada request no escala conforme crecen las reseñas. Una señal `post_save`/`post_delete` sobre `Review` recalcula y persiste el agregado en su lugar. |
| Selección de base de datos dirigida por `DATABASE_URL` (PostgreSQL en producción vía `dj-database-url`, SQLite como fallback local) | Desarrollo local sin configuración y sin dependencias externas, base de datos de nivel producción en el despliegue sin tocar código. |
| Cloudinary como backend de medios | Delega el almacenamiento de archivos, transformación y entrega vía CDN en lugar de administrar un servidor de medios propio; se comporta igual en desarrollo local y en producción. |
| Wrapper nativo de `fetch` (`src/lib/api.ts`) en lugar de un cliente HTTP más pesado en el frontend | Un único lugar para adjuntar el token JWT, el header `Accept-Language`, y el manejo de multipart — sin dependencia adicional en tiempo de ejecución para lo que es una capa de API delgada y predecible. |
| Next.js App Router con dos árboles de rutas por rol (`/dashboard/doctor`, `/dashboard/patient`) | El enrutamiento por sistema de archivos mapea directamente los dos recorridos de usuario muy distintos, y cada árbol de dashboard envía solo los componentes que su rol necesita. |

---

## Reglas de negocio

Las reglas siguientes están implementadas en código (restricciones de modelo, validadores `clean()`, o clases de permisos), no solo descritas en documentación — cada una corresponde a una salvaguarda específica en el código fuente.

**Agendamiento**
- El estado clínico de una cita (`Unpaid`, `Confirmed`, `In Progress`, `Completed`, `Cancelled`, `No Show`) se rastrea de forma independiente de su estado de pago, que vive en la `Invoice` vinculada.
- Un doctor no puede tener dos citas en estado bloqueante (`Confirmed`, `In Progress`, `Completed`, `No Show`) en la misma fecha y hora — impuesto por una restricción única condicional a nivel de base de datos, de modo que los horarios `Unpaid` y `Cancelled` pueden coexistir o reintentarse libremente.
- Las citas virtuales no pueden tener una sede asignada; las citas presenciales deben tener una.
- Las cancelaciones registran quién canceló (paciente, doctor, admin o sistema) y por qué; las reprogramaciones conservan la fecha/hora original e incrementan un contador.
- Cuando un paciente cancela una cita pagada, el porcentaje de reembolso depende de cuánta anticipación dio: 100% con más de 48 horas de antelación, 50% entre 24 y 48 horas, 0% dentro de las 24 horas. Una cancelación iniciada por el doctor siempre reembolsa el 100%, sin importar la anticipación — el paciente nunca es penalizado por una decisión del doctor.
- El horario semanal de un doctor (`DoctorSchedule`) no tiene API de autoservicio — los bloques de horario se crean y editan exclusivamente desde el admin de Django. Un doctor puede leer su propio horario pero no modificarlo desde su dashboard (ver [Limitaciones conocidas](#limitaciones-conocidas-y-comportamiento-simulado)).

**Historiales clínicos y flujo de consulta**
- Se crea como máximo un historial médico por cita, y es el punto de anclaje de cualquier receta u orden de laboratorio ligada a esa consulta.
- Una línea de receta puede apuntar a un medicamento del catálogo o ser texto libre — un doctor no está limitado a recetar solo lo que existe en el formulario propio del hospital.
- Un doctor solo puede mover una cita a través de un grafo de estados fijo: `Confirmed` → `In Progress`, `Completed`, `Cancelled` o `No Show`; `In Progress` → `Completed` o `Cancelled`. Cualquier otra transición se rechaza. Una cita virtual no puede pasar a `In Progress` sin antes fijar un enlace de videollamada.
- Cerrar una consulta es una sola acción atómica: crea el historial médico y, en la misma solicitud, opcionalmente una receta y/u orden de laboratorio juntos. No puede ejecutarse dos veces sobre la misma cita, y ninguno de esos tres registros puede editarse ni borrarse después vía API — desde la perspectiva de la API, el historial clínico de un paciente es de solo-agregar.

**Farmacia y cumplimiento de recetas**
- Los medicamentos y las pruebas de laboratorio declaran, cada uno de forma independiente, dos banderas: `requires_prescription` y `free_when_prescribed`. Si `requires_prescription` es `False`, el paciente puede comprar o reservar el artículo directamente, sin que intervenga ningún doctor. Si es `True`, el endpoint de compra/reserva exige un ítem de receta sin reclamar para ese medicamento o prueba exacta — emitido antes por un doctor a través de una cita completada (`MedicalRecord` → `Prescription`/`LabOrder`) — y devuelve `403` en caso contrario. No existe forma de obtener un artículo con receta obligatoria sin esa consulta previa.
- El precio de un artículo con receta obligatoria es `$0` únicamente cuando está respaldado por un ítem de receta sin reclamar **y** el registro del catálogo tiene `free_when_prescribed = True` (el valor por defecto); en cualquier otro caso el paciente paga el precio completo del catálogo, tenga o no receta.
- Un medicamento (o prueba de laboratorio) recetado puede reclamarse como máximo una vez entre todos los pedidos no cancelados — impuesto mediante un enlace uno-a-uno entre la línea del pedido y el ítem de receta origen, evitando que la misma receta se despache dos veces por rutas paralelas de retiro/entrega.
- El envío se cobra distinto según cuál de dos flujos de farmacia, no intercambiables entre sí, procese el pedido:
  - **Carrito de farmacia** (comprar medicamentos, recetados o no, uno a la vez): el envío es siempre gratis sin importar si se elige retiro o entrega a domicilio — el precio de cada artículo ya lo contempla. Reclamar un artículo recetado a `$0` desde el carrito con entrega a domicilio no cuesta nada en absoluto, envío incluido.
  - **Flujo dedicado "solicitar entrega"** (agrupa todos los medicamentos recetados sin reclamar de una receta en un solo pedido de entrega): siempre cobra una tarifa de envío fija además, sin importar si los medicamentos agrupados se cotizan en `$0` o a precio completo. Este es el único camino del sistema donde se cobra envío.
- El código de retiro de un pedido de farmacia se genera una sola vez, únicamente en el momento en que pasa a `Paid` (pago en línea o cubierto totalmente por una receta); permanece sin definir mientras el pago está pendiente, de modo que un pedido no pagado nunca puede retirarse en una sede.

**Reseñas**
- Una reseña solo puede enviarse para una cita con estado `Completed`, y solo por el paciente dueño de esa cita; ese mismo paciente puede editarla o borrarla después, y solo existe una reseña por cita.
- La visibilidad de las reseñas es pública, no está limitada al autor: cualquier paciente puede navegar un feed con todas las reseñas de todos los doctores, y las reseñas individuales de un doctor específico son legibles incluso por un visitante sin sesión iniciada. El catálogo de doctores que el paciente navega antes de agendar ya muestra la calificación promedio y el número de reseñas de cada doctor — se espera que el paciente elija por reputación antes de ser atendido, no que solo califique después.

**Facturación**
- Cada factura factura exactamente uno entre una cita o un pedido de farmacia — nunca ambos, nunca ninguno — impuesto con una restricción de verificación a nivel de base de datos.
- La numeración de facturas es secuencial por día calendario (`INV-YYYYMMDD-NNNN`).
- Las líneas de factura guardan una instantánea del precio al momento de facturar; cambios posteriores de precio en el servicio o medicamento subyacente nunca alteran facturas históricas.
- La suma de reembolsos completados contra un pago nunca puede exceder el monto original del pago.
- Cada pago conserva la respuesta cruda de la pasarela junto con un estado normalizado, de modo que la reconciliación nunca requiere volver a consultar soporte de Stripe o PayPal.

**Identidad y acceso**
- La autenticación es por correo electrónico, no por nombre de usuario; los nombres de usuario se derivan automáticamente y se deduplican con un sufijo numérico.
- El rol de un usuario (`Patient` / `Doctor` / `Superuser`) es necesario pero no suficiente para autorización — el acceso también requiere que exista el objeto de perfil correspondiente.
- Los tokens de acceso expiran a los 30 minutos; los tokens de refresco a los 7 días, con rotación activada, de modo que un token de refresco capturado solo puede usarse una vez antes de invalidarse.

---

## Arquitectura del sistema

```mermaid
flowchart LR
    subgraph client["Cliente"]
        FE["Next.js 16 (App Router)<br/>React 19 + TypeScript"]
    end

    subgraph api["API REST Django"]
        AUTH["userauths<br/>autenticación JWT"]
        DOC["doctor"]
        PAT["patient"]
        BASE["base<br/>núcleo clínico / agendamiento"]
        BILL["billing"]
    end

    DB[("PostgreSQL (prod)<br/>SQLite (local)")]
    MEDIA[("Cloudinary<br/>almacenamiento de medios")]
    STRIPE[["Stripe"]]
    PAYPAL[["PayPal"]]
    SENDGRID[["SendGrid"]]

    FE -->|"REST, token JWT bearer"| AUTH
    FE --> DOC
    FE --> PAT
    FE --> BASE
    FE --> BILL

    AUTH --> DB
    DOC --> DB
    PAT --> DB
    BASE --> DB
    BILL --> DB

    DOC --> MEDIA
    PAT --> MEDIA
    BASE --> MEDIA

    BILL -->|"Checkout, Setup Intents, webhook"| STRIPE
    BILL -->|"Orders API"| PAYPAL
    AUTH -->|"Correo transaccional"| SENDGRID
```

Cada app de Django es dueña de sus propios modelos y vistas, pero todas comparten una única base de datos PostgreSQL/SQLite; no hay una frontera de servicio entre ellas a nivel de datos, por diseño — esto es un monolito modular, no un sistema de microservicios, lo cual corresponde a la escala real del proyecto y evita pagar un costo de sistemas distribuidos que no necesita.

---

## Esquema de base de datos

El esquema se divide en cuatro diagramas que reflejan las apps de Django, para mantener cada uno legible. Las claves primarias son IDs cortos tipo UUID (`sid`) expuestos por la API; los IDs numéricos permanecen internos.

### Identidad y equipo de atención

```mermaid
erDiagram
    USER ||--o| DOCTOR : "tiene perfil"
    USER ||--o| PATIENT : "tiene perfil"
    DOCTOR ||--o{ DOCTOR_QUALIFICATION : lista
    DOCTOR ||--o{ DOCTOR_SCHEDULE : define

    USER {
        string sid
        string email UK
        string user_type "Patient / Doctor / Superuser"
        string otp
    }
    DOCTOR {
        string sid
        string specialization
        int years_of_experience
        decimal average_rating "desnormalizado, sincronizado vía señal"
        int total_reviews
    }
    PATIENT {
        string sid
        date date_of_birth
        string blood_group
        string stripe_customer_id
    }
    DOCTOR_QUALIFICATION {
        string degree
        string institution
        int year
    }
    DOCTOR_SCHEDULE {
        int day_of_week
        time start_time
        time end_time
        time break_start
        time break_end
    }
```

### Agendamiento e historiales clínicos

```mermaid
erDiagram
    DOCTOR ||--o{ APPOINTMENT : atiende
    PATIENT ||--o{ APPOINTMENT : reserva
    BRANCH ||--o{ APPOINTMENT : aloja
    SERVICE ||--o{ APPOINTMENT : "facturada como"
    APPOINTMENT ||--o| MEDICAL_RECORD : produce
    APPOINTMENT ||--o| REVIEW : "calificada por"
    MEDICAL_RECORD ||--o| PRESCRIPTION : emite
    MEDICAL_RECORD ||--o{ LAB_ORDER : solicita
    PRESCRIPTION ||--o{ PRESCRIPTION_ITEM : contiene
    MEDICATION ||--o{ PRESCRIPTION_ITEM : "referenciado por"
    LAB_ORDER ||--o{ LAB_ORDER_ITEM : contiene
    LAB_TEST ||--o{ LAB_ORDER_ITEM : "referenciado por"
    LAB_ORDER_ITEM ||--o| LAB_RESULT : produce

    APPOINTMENT {
        string sid
        datetime date
        string status "Unpaid / Confirmed / In Progress / Completed / Cancelled / No Show"
        string mode "In-Person / Virtual"
        string cancelled_by
        int reschedule_count
    }
    MEDICAL_RECORD {
        string sid
        text diagnosis
        text treatment_plan
    }
    PRESCRIPTION_ITEM {
        string medication_name
        boolean is_system_medication
        string dosage
        string frequency
        int duration_days
        string delivery_method
    }
    LAB_ORDER {
        string sid
        string status
        boolean is_prescribed
    }
    LAB_ORDER_ITEM {
        boolean is_claimed
    }
    LAB_RESULT {
        text result_text
        file result_file
    }
    REVIEW {
        int rating "1 a 5"
        text comment
    }
```

### Farmacia y entregas

```mermaid
erDiagram
    PATIENT ||--o{ MEDICINE_ORDER : realiza
    BRANCH ||--o{ MEDICINE_ORDER : "retiro en"
    MEDICINE_ORDER ||--o{ MEDICINE_ORDER_ITEM : contiene
    MEDICATION ||--o{ MEDICINE_ORDER_ITEM : "referenciado por"
    MEDICINE_ORDER ||--o| MEDICINE_DELIVERY : "rastreado por"
    PRESCRIPTION_ITEM ||--o| MEDICINE_ORDER_ITEM : cumple

    MEDICINE_ORDER {
        string sid
        string status
        decimal subtotal
        decimal shipping_fee
        decimal total
        string pickup_code UK "se define solo al pasar a Paid"
    }
    MEDICINE_ORDER_ITEM {
        int quantity
        decimal unit_price
        decimal total
    }
    MEDICINE_DELIVERY {
        string stage "picked_up ... delivered"
        datetime started_at
        datetime delivered_at
    }
```

### Facturación

```mermaid
erDiagram
    PATIENT ||--o{ INVOICE : "facturado a"
    APPOINTMENT ||--o| INVOICE : "facturada por (opcional)"
    MEDICINE_ORDER ||--o| INVOICE : "facturado por (opcional)"
    INVOICE ||--o{ INVOICE_LINE_ITEM : contiene
    INVOICE ||--o{ PAYMENT : "pagada vía"
    PAYMENT ||--o{ REFUND : "reembolsado por"
    INVOICE ||--o{ BILLING_DISPUTE : disputada

    INVOICE {
        string sid
        string invoice_number UK "INV-YYYYMMDD-NNNN"
        decimal total
        decimal amount_paid
        decimal balance_due
        string status
    }
    INVOICE_LINE_ITEM {
        string description
        int quantity
        decimal unit_price
        decimal total "instantánea de precio"
    }
    PAYMENT {
        string sid
        decimal amount
        string payment_method "cash / card / bank_transfer / stripe / paypal"
        string status
        string gateway_charge_id
        json gateway_response
    }
    REFUND {
        decimal amount
        string reason
        string status
    }
    BILLING_DISPUTE {
        decimal amount_disputed
        string reason
        string status
    }
```

`Invoice.appointment` e `Invoice.medicine_order` son ambos campos uno-a-uno opcionales; una restricción `CheckConstraint` a nivel de base de datos exige que exactamente uno de los dos esté definido, algo que un diagrama entidad-relación no puede expresar directamente — está impuesto en `billing/models.py`, no solo en el código de la aplicación.

---

## Capacidades por rol

### Paciente

- **Cuenta**: registro, inicio de sesión, edición de perfil (contacto, datos demográficos, foto), panel de estadísticas propio (citas, historiales, resultados de laboratorio, notificaciones sin leer).
- **Citas**: navegar el catálogo público de servicios/doctores (visible incluso sin sesión), reservar presencial o virtual, pagar de inmediato o después, listar sus propias citas, reprogramar gratis contra el horario en vivo del doctor, cancelar con reembolso escalonado según anticipación, o eliminar directamente mientras siga sin pagar.
- **Historial clínico**: acceso de solo lectura a sus propios historiales médicos, recetas y órdenes/resultados de laboratorio; descarga de PDFs de receta y orden de laboratorio bajo demanda.
- **Farmacia**: navegar el catálogo público de medicamentos de venta libre, comprar medicamentos —recetados o no— mediante un carrito que soporta retiro o entrega a domicilio, o agrupar todas las medicinas recetadas pendientes en una sola solicitud de entrega dedicada.
- **Pruebas de laboratorio**: navegar el catálogo público de laboratorios (marcado con una insignia "gratis para ti" cuando existe una receta sin reclamar que coincide), reservar un laboratorio directo cuando no requiere receta, o gratis contra una que sí la requiere.
- **Seguimiento de entregas**: listar todos los pedidos en modalidad entrega y consultar un rastreador en vivo por pedido (ver [Limitaciones conocidas](#limitaciones-conocidas-y-comportamiento-simulado) para entender qué tan "en vivo" es realmente).
- **Pagos**: checkout con Stripe/PayPal, gestión de tarjetas guardadas, historial y totales de pagos propios.
- **Reseñas**: calificar y comentar sobre cualquier doctor a partir de una cita completada (una por cita, editable), y por separado navegar un feed público con todas las reseñas de todos los doctores, o las de un doctor específico — no limitado a lo que el propio paciente haya enviado.
- **Notificaciones**: listar, filtrar por leído/no leído, marcar como leída, borrar.

### Doctor

- **Perfil**: editar su perfil y biografía; agregar o eliminar cualificaciones (título, institución, año, certificado).
- **Disponibilidad**: leer su propio horario semanal vía API. Los bloques de horario en sí solo se gestionan actualmente desde el admin de Django, sin autoservicio (ver [Limitaciones conocidas](#limitaciones-conocidas-y-comportamiento-simulado)).
- **Agenda**: listar y filtrar sus citas por fecha/mes; ver el detalle completo de una cita, incluyendo contacto y datos demográficos del paciente.
- **Flujo de consulta**: llevar una cita a través de `Confirmed → In Progress → Completed` (o `Cancelled`/`No Show`); cerrar una consulta en una sola acción atómica que crea el historial médico y, opcionalmente, una receta y/u orden de laboratorio juntos (ver [Reglas de negocio](#reglas-de-negocio)).
- **Cancelar/reprogramar**: cancelar una cita confirmada (siempre con reembolso completo al paciente) o reprogramarla contra su propio horario en vivo.
- **Pagos y estadísticas**: ver sus propios pagos recibidos y estadísticas de ingresos; un dashboard que resume número de citas, número de pacientes, calificación promedio, cantidad de reseñas, ingresos y notificaciones sin leer.
- **Reseñas**: leer sus propias reseñas vía el endpoint público por doctor; no puede responder, editar ni borrar una reseña de un paciente.
- **Notificaciones**: listar, filtrar, marcar como leída, borrar.

### Notificaciones por correo (SendGrid)

Cada correo transaccional es de "disparar y olvidar" — un envío fallido queda registrado en el log pero nunca bloquea la solicitud — y todos comparten una misma plantilla con marca. Existen ocho disparadores distintos de punta a punta:

| Disparador | Se envía cuando | Adjunto |
|---|---|---|
| Reset de contraseña | Se solicita un reset | — |
| Cita confirmada | El pago de una cita se completa | PDF de factura |
| Cita cancelada | Cualquiera de las dos partes cancela | — |
| Cita reprogramada | Cualquiera de las dos partes reprograma | — |
| Consulta virtual iniciada | El doctor marca la cita virtual como `In Progress` | Enlace de videollamada |
| Pedido de farmacia listo para retiro | Se paga un pedido con modalidad retiro | Código QR de retiro, PDF de factura |
| Pedido de farmacia enviado | Se paga un pedido con modalidad entrega | PDF de factura, enlace de seguimiento |
| Entrega completada | El propio polling de seguimiento del paciente detecta la etapa final | — |

Actualmente no existe correo de bienvenida al registrarse ni de "resultados de laboratorio listos" — ambos son adiciones naturales, todavía no construidas.

---

## Limitaciones conocidas y comportamiento simulado

Siendo transparente sobre qué es una simplificación deliberada de alcance de demo y qué es una integración real:

- **El seguimiento de entregas está simulado, no es real.** No hay integración con ningún mensajero, webhook, ni geolocalización en ninguna parte del código. `MedicineDelivery.stage` se calcula en cada consulta a partir del tiempo transcurrido desde que se pagó el pedido — 5 etapas fijas de 30 segundos cada una, unos 2 minutos de punta a punta — no a partir de ningún evento real. El correo de "entrega completada" solo se envía la próxima vez que el propio cliente del paciente consulta el endpoint de seguimiento después de alcanzar la etapa final; no hay ningún worker en segundo plano que garantice su envío si el paciente nunca vuelve a abrir esa pantalla. El siguiente paso real aquí sería un webhook de mensajería (o, como mínimo, una tarea programada en vez de polling disparado por el cliente) — construir eso de verdad, en lugar de la simulación actual, está en el roadmap.
- **La disponibilidad del doctor todavía no tiene API de autoservicio.** El horario semanal de un doctor (`DoctorSchedule`) actualmente solo puede crearse o editarse desde el admin de Django — no existe un endpoint de "gestionar mi disponibilidad" en el propio dashboard del doctor.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Django 6, Django REST Framework, `djangorestframework-simplejwt` |
| Base de datos | PostgreSQL (producción, vía `dj-database-url`), SQLite (fallback local) |
| Almacenamiento de medios | Cloudinary |
| Archivos estáticos | Whitenoise |
| Panel de administración | Django Jazzmin |
| Pagos | Stripe (Checkout, Setup Intents, webhooks), PayPal (Orders API) |
| Correo | SendGrid |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| UI | shadcn/ui, `@base-ui/react`, Tailwind CSS v4, Framer Motion |
| i18n | `next-intl` (español/inglés) |

---

## Roadmap

- **Chat seguro paciente-doctor vía [Medplum](https://github.com/medplum/medplum)** — una plataforma de salud de código abierto, nativa en FHIR. Medplum se está adoptando de forma deliberada, no como una función genérica de chat: está construida alrededor de los estándares de cifrado, control de acceso e interoperabilidad que generalmente se espera que cumpla el intercambio de datos de salud, que es el mismo nivel que esta integración busca darle al proyecto, en lugar de construir mensajería a medida que tendría que reinventar esas garantías.
- Capacidades adicionales sobre Medplum (sincronización estructurada de recursos FHIR, intercambio de datos clínicos) conforme madure la integración.
- **Una implementación real de seguimiento de entregas**, que reemplace la simulación actual basada en tiempo descrita en [Limitaciones conocidas](#limitaciones-conocidas-y-comportamiento-simulado) — probablemente un webhook de mensajería (o, como mínimo, una tarea programada) que mueva `MedicineDelivery.stage` a partir de eventos reales en vez de tiempo transcurrido en cada lectura.
- Un endpoint de gestión de horario para el doctor, para que la disponibilidad semanal ya no dependa del admin de Django.

---

## Puesta en marcha

### Requisitos previos

- Python 3.13+ (el `venv` incluido usa 3.14)
- Node.js 18.18+ (se recomienda 20+, por Next.js 16)
- Claves de API de Stripe, PayPal, Cloudinary y SendGrid
- PostgreSQL (opcional en local — usa SQLite como fallback si `DATABASE_URL` no está definida)

### Backend

```powershell
cd backend\CHOHEALT_BACK

python -m venv venv
.\venv\Scripts\Activate.ps1

pip install -r requirements.txt

# crear backend\CHOHEALT_BACK\.env — ver variables abajo

python manage.py migrate
python manage.py createsuperuser   # opcional, para /admin
python manage.py runserver
```

API disponible en `http://127.0.0.1:8000/api/`, admin en `http://127.0.0.1:8000/admin/`.

`backend/CHOHEALT_BACK/.env`:

```
SECRET_KEY=
DEBUG=True
ALLOWED_HOSTS=
CORS_ALLOWED_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000

DATABASE_URL=                 # opcional; usa SQLite local como fallback
DATABASE_NAME=
DATABASE_USER=
DATABASE_PASSWORD=
DATABASE_HOST=
DATABASE_PORT=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_MODE=sandbox            # o "live"

SENDGRID_API_KEY=
DEFAULT_FROM_EMAIL=
EMAIL_DOMAIN=
```

### Frontend

```powershell
cd frontend
npm install
```

`frontend/.env`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
```

```powershell
npm run dev
```

Frontend disponible en `http://localhost:3000`. Ejecuta backend y frontend en dos terminales — el frontend depende de la API para todo (autenticación, citas, pagos, etc.).

---

## Aviso

Este es un proyecto de portafolio y aprendizaje que demuestra ingeniería full-stack y lógica de negocio del dominio de salud. No es software médico certificado y no está pensado para manejar datos reales de pacientes en producción sin trabajo de cumplimiento normativo adicional.
