# CHOHEALTH

A full-stack healthcare platform connecting patients and hospitals.

Language: **English** | [Espanol](README.es.md)

![Django](https://img.shields.io/badge/Django-6-092E20?logo=django&logoColor=white)
![DRF](https://img.shields.io/badge/DRF-REST%20API-A30000)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Production-4169E1?logo=postgresql&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?logo=stripe&logoColor=white)
![PayPal](https://img.shields.io/badge/PayPal-Payments-003087?logo=paypal&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000)

---

## Table of contents

1. [Problem statement](#problem-statement)
2. [Architectural decisions](#architectural-decisions)
3. [Business rules](#business-rules)
4. [System architecture](#system-architecture)
5. [Database schema](#database-schema)
6. [Features](#features)
7. [Tech stack](#tech-stack)
8. [Roadmap](#roadmap)
9. [Getting started](#getting-started)
10. [Disclaimer](#disclaimer)

---

## Problem statement

Booking a doctor, getting a prescription filled, and paying for care are usually three disconnected experiences for a patient — a phone call to schedule, a paper slip for the pharmacy, a separate portal (or none at all) to see the bill. CHOHEALTH is built to unify that flow into a single product: a patient books an appointment, the doctor produces a medical record and prescription during the visit, the patient fills it through an integrated pharmacy with delivery tracking, and every one of those steps generates a consistent, auditable invoice — all in one authenticated session, in the patient's own language.

The engineering goal behind the project was not to build another CRUD demo, but to practice the parts of healthcare software that are unforgiving of shortcuts: preventing a double-booked doctor, keeping a financial ledger that cannot silently drift from reality, reconciling two different payment gateways against the same billing model, and enforcing who is allowed to see or do what.

This is an active portfolio project, not a finished product — see [Roadmap](#roadmap).

---

## Architectural decisions

| Decision | Rationale |
|---|---|
| Django + DRF for the API | Mature ORM with real database-level constraints (not just serializer validation), and a batteries-included admin (Jazzmin) that covers internal/staff tooling without building a separate admin app. |
| Polymorphic `Invoice` via two nullable one-to-one fields + a `CheckConstraint`, instead of a generic foreign key | Keeps referential integrity and normal SQL joins on `Invoice.appointment` / `Invoice.medicine_order`, while a database-level XOR check makes it structurally impossible to bill both — or neither — target from the same invoice, even if a future view has a bug. |
| Booking conflict prevention enforced at the database layer, not only in view logic | A conditional unique constraint on `(doctor, date)` is the last line of defense against a race condition where two patients pay for the same slot within milliseconds of each other. Application-level checks run first for a fast, friendly error; the constraint is what actually guarantees correctness under concurrency. |
| Hosted checkout (Stripe Checkout, PayPal redirect) as the primary payment path; Stripe Elements only for saved cards | Hosted checkout keeps PCI-DSS scope on the gateway's side instead of the app's. Elements is used narrowly, for the one flow (saving a card for later) where a hosted redirect would be worse UX. |
| One shared Stripe webhook for both appointments and pharmacy orders, routed by metadata | Avoids duplicating webhook signature verification and event handling for two billable entity types; the invoice/payment model already treats them polymorphically, so the webhook mirrors that. |
| Role stored on the user (`user_type`) but never trusted alone for authorization | Custom DRF permissions (`IsDoctor`, `IsPatient`) check the role **and** that the related profile object actually exists. A user who claims a role without a matching profile is not authorized — closing a gap that a naive `request.user.user_type == 'Doctor'` check would leave open. |
| Denormalized doctor rating, kept in sync via signals | The doctor list/search is a hot read path; recomputing an average on every request does not scale as reviews grow. A `post_save`/`post_delete` signal on `Review` recalculates and persists the aggregate instead. |
| `DATABASE_URL`-driven database selection (PostgreSQL in production via `dj-database-url`, SQLite fallback locally) | Zero-configuration local development with no external dependency, production-grade database in deployment without touching code. |
| Cloudinary as the media backend | Offloads file storage, transformation and CDN delivery instead of managing a media server; behaves identically in local development and production. |
| Native `fetch` wrapper (`src/lib/api.ts`) instead of a heavier HTTP client on the frontend | One place to attach the JWT bearer token, the `Accept-Language` header, and multipart handling — no extra runtime dependency for what is a thin, predictable API layer. |
| Next.js App Router with two role-scoped route trees (`/dashboard/doctor`, `/dashboard/patient`) | File-system routing maps directly onto the two very different user journeys, and each dashboard tree ships only the components its role needs. |

---

## Business rules

The rules below are enforced in code (model constraints, `clean()` validators, or permission classes), not just described in documentation — each one maps to a specific safeguard in the codebase.

**Scheduling**
- An appointment's clinical status (`Unpaid`, `Confirmed`, `In Progress`, `Completed`, `Cancelled`, `No Show`) is tracked independently from its payment status, which lives on the linked `Invoice`.
- A doctor cannot hold two appointments in a blocking status (`Confirmed`, `In Progress`, `Completed`, `No Show`) at the same date and time — enforced by a conditional unique constraint at the database level, so `Unpaid` and `Cancelled` slots are free to coexist or be retried.
- Virtual appointments cannot have a branch assigned; in-person appointments must have one.
- Cancellations record who cancelled (patient, doctor, admin, or system) and why; reschedules preserve the original datetime and increment a counter.

**Clinical records**
- A medical record is created at most once per appointment and is the anchor for any prescription or lab order tied to that visit.
- A prescription line can point to a catalog medication or be free text — a doctor is not blocked from prescribing something outside the hospital's own formulary.

**Pharmacy and prescription fulfillment**
- Medications and lab tests each declare, independently, two flags: `requires_prescription` and `free_when_prescribed`. If `requires_prescription` is `False`, a patient can buy or book the item directly, with no doctor involved. If it's `True`, the purchase or booking endpoint requires an unclaimed prescription item for that exact medication or lab test — issued earlier by a doctor through a completed appointment (`MedicalRecord` → `Prescription`/`LabOrder`) — and returns `403` otherwise. There is no way to acquire a prescription-gated item without that prior visit.
- Pricing for a prescription-gated item is `$0` only when it is backed by an unclaimed prescription item **and** the catalog entry has `free_when_prescribed = True` (the default); otherwise the patient pays the full catalog price, whether or not a prescription exists.
- A prescribed medication (or lab test) can be claimed at most once across all non-cancelled orders — enforced with a one-to-one link between the order line and the source prescription item, so the same prescription can't be dispensed twice through parallel pickup/delivery paths.
- Shipping is priced differently depending on which of two distinct pharmacy flows the order goes through, and the two are not interchangeable:
  - **Pharmacy cart** (buying medications, prescribed or not, one at a time): shipping is always free regardless of pickup or delivery — the per-item price already accounts for it. Claiming a `$0` prescribed item through the cart with delivery selected costs nothing at all, shipping included.
  - **Dedicated "request delivery" flow** (bundles every unclaimed prescribed medication from one prescription into a single delivery order): always charges a flat shipping fee on top, regardless of whether the bundled medications price at `$0` or at full cost. This is the only path in the system where shipping is charged.
- A pharmacy order's pickup code is generated once, only at the moment it becomes `Paid` (online payment or fully covered by a prescription); it stays unset while payment is pending, so an unpaid order can never be collected at a branch.

**Reviews**
- A review can only be submitted for an appointment with status `Completed`, and only by the patient who owns that appointment.

**Billing**
- Every invoice bills exactly one of an appointment or a pharmacy order — never both, never neither — enforced with a database check constraint.
- Invoice numbers are sequential per calendar day (`INV-YYYYMMDD-NNNN`).
- Line items store a price snapshot at billing time; later price changes to the underlying service or medication never alter historical invoices.
- The sum of completed refunds against a payment can never exceed the original payment amount.
- Every payment retains the gateway's raw response alongside a normalized status, so reconciliation never requires going back to Stripe or PayPal support.

**Identity and access**
- Authentication is by email, not username; usernames are derived automatically and de-duplicated with a numeric suffix.
- A user's role (`Patient` / `Doctor` / `Superuser`) is necessary but not sufficient for authorization — access also requires the matching profile object to exist.
- Access tokens expire after 30 minutes; refresh tokens after 7 days, with rotation enabled so a captured refresh token can be used only once before it is invalidated.

---

## System architecture

```mermaid
flowchart LR
    subgraph client["Client"]
        FE["Next.js 16 (App Router)<br/>React 19 + TypeScript"]
    end

    subgraph api["Django REST API"]
        AUTH["userauths<br/>JWT authentication"]
        DOC["doctor"]
        PAT["patient"]
        BASE["base<br/>scheduling / clinical core"]
        BILL["billing"]
    end

    DB[("PostgreSQL (prod)<br/>SQLite (local)")]
    MEDIA[("Cloudinary<br/>media storage")]
    STRIPE[["Stripe"]]
    PAYPAL[["PayPal"]]
    SENDGRID[["SendGrid"]]

    FE -->|"REST, JWT bearer token"| AUTH
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
    AUTH -->|"Transactional email"| SENDGRID
```

Each Django app owns its own models and views but shares one PostgreSQL/SQLite database; there is no service boundary between them at the data layer, by design — this is a modular monolith, not a microservice system, which matches the project's actual scale and avoids paying a distributed-systems tax it does not need.

---

## Database schema

The schema is split across four diagrams that mirror the Django apps, to keep each one legible. Primary keys are UUID-like short IDs (`sid`) exposed to the API; numeric IDs stay internal.

### Identity and care team

```mermaid
erDiagram
    USER ||--o| DOCTOR : "has profile"
    USER ||--o| PATIENT : "has profile"
    DOCTOR ||--o{ DOCTOR_QUALIFICATION : lists
    DOCTOR ||--o{ DOCTOR_SCHEDULE : defines

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
        decimal average_rating "denormalized, synced via signal"
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

### Scheduling and clinical records

```mermaid
erDiagram
    DOCTOR ||--o{ APPOINTMENT : attends
    PATIENT ||--o{ APPOINTMENT : books
    BRANCH ||--o{ APPOINTMENT : hosts
    SERVICE ||--o{ APPOINTMENT : "billed as"
    APPOINTMENT ||--o| MEDICAL_RECORD : produces
    APPOINTMENT ||--o| REVIEW : "rated by"
    MEDICAL_RECORD ||--o| PRESCRIPTION : issues
    MEDICAL_RECORD ||--o{ LAB_ORDER : requests
    PRESCRIPTION ||--o{ PRESCRIPTION_ITEM : contains
    MEDICATION ||--o{ PRESCRIPTION_ITEM : "referenced by"
    LAB_ORDER ||--o{ LAB_ORDER_ITEM : contains
    LAB_TEST ||--o{ LAB_ORDER_ITEM : "referenced by"
    LAB_ORDER_ITEM ||--o| LAB_RESULT : produces

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
        int rating "1 to 5"
        text comment
    }
```

### Pharmacy and delivery

```mermaid
erDiagram
    PATIENT ||--o{ MEDICINE_ORDER : places
    BRANCH ||--o{ MEDICINE_ORDER : "picked up at"
    MEDICINE_ORDER ||--o{ MEDICINE_ORDER_ITEM : contains
    MEDICATION ||--o{ MEDICINE_ORDER_ITEM : "referenced by"
    MEDICINE_ORDER ||--o| MEDICINE_DELIVERY : "tracked by"
    PRESCRIPTION_ITEM ||--o| MEDICINE_ORDER_ITEM : fulfills

    MEDICINE_ORDER {
        string sid
        string status
        decimal subtotal
        decimal shipping_fee
        decimal total
        string pickup_code UK "set only once Paid"
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

### Billing

```mermaid
erDiagram
    PATIENT ||--o{ INVOICE : "billed to"
    APPOINTMENT ||--o| INVOICE : "billed by (nullable)"
    MEDICINE_ORDER ||--o| INVOICE : "billed by (nullable)"
    INVOICE ||--o{ INVOICE_LINE_ITEM : contains
    INVOICE ||--o{ PAYMENT : "paid via"
    PAYMENT ||--o{ REFUND : "refunded by"
    INVOICE ||--o{ BILLING_DISPUTE : disputed

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
        decimal total "price snapshot"
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

`Invoice.appointment` and `Invoice.medicine_order` are both nullable one-to-one fields; a database `CheckConstraint` requires exactly one of them to be set, which an entity-relationship diagram cannot express directly — it is enforced in `billing/models.py`, not only in application code.

---

## Features

- Separate registration and login flows for patients and doctors, with JWT-based sessions.
- Appointment booking, rescheduling, cancellation and completion, in-person or virtual, against a per-doctor availability calendar.
- Medical records, prescriptions and lab orders generated during a visit and linked to it.
- An integrated pharmacy: medication catalog, direct purchase with a QR pickup code, or home delivery with live-tracked status.
- Stripe and PayPal payments: hosted checkout, saved cards, refunds, and billing disputes.
- Automatic invoicing with sequential numbering and payment dashboards for both patients and doctors.
- Doctor reviews and ratings, restricted to completed appointments.
- In-app notifications for both roles.
- Bilingual interface (English/Spanish).

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Django 6, Django REST Framework, `djangorestframework-simplejwt` |
| Database | PostgreSQL (production, via `dj-database-url`), SQLite (local fallback) |
| Media storage | Cloudinary |
| Static files | Whitenoise |
| Admin UI | Django Jazzmin |
| Payments | Stripe (Checkout, Setup Intents, webhooks), PayPal (Orders API) |
| Email | SendGrid |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| UI | shadcn/ui, `@base-ui/react`, Tailwind CSS v4, Framer Motion |
| i18n | `next-intl` (English/Spanish) |

---

## Roadmap

- **Secure patient-doctor chat via [Medplum](https://github.com/medplum/medplum)** — an open-source, FHIR-native healthcare platform. Medplum is being adopted deliberately, not as a generic chat feature: it is built around the encryption, access-control and interoperability standards that healthcare data exchange is generally expected to meet, which is the same bar this integration is meant to hold the project to, rather than building bespoke messaging infrastructure that would need to reinvent those guarantees.
- Additional Medplum-backed capabilities (structured FHIR resource sync, clinical data exchange) as the integration matures.

---

## Getting started

### Prerequisites

- Python 3.13+ (the bundled `venv` uses 3.14)
- Node.js 18.18+ (20+ recommended for Next.js 16)
- API keys for Stripe, PayPal, Cloudinary and SendGrid
- PostgreSQL (optional locally — falls back to SQLite if `DATABASE_URL` is unset)

### Backend

```powershell
cd backend\CHOHEALT_BACK

python -m venv venv
.\venv\Scripts\Activate.ps1

pip install -r requirements.txt

# create backend\CHOHEALT_BACK\.env — see variables below

python manage.py migrate
python manage.py createsuperuser   # optional, for /admin
python manage.py runserver
```

API available at `http://127.0.0.1:8000/api/`, admin at `http://127.0.0.1:8000/admin/`.

`backend/CHOHEALT_BACK/.env`:

```
SECRET_KEY=
DEBUG=True
ALLOWED_HOSTS=
CORS_ALLOWED_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000

DATABASE_URL=                 # optional; falls back to local SQLite
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
PAYPAL_MODE=sandbox            # or "live"

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

Frontend available at `http://localhost:3000`. Run backend and frontend in two terminals — the frontend depends on the API for everything (authentication, appointments, payments, and so on).

---

## Disclaimer

This is a portfolio and learning project demonstrating full-stack engineering and healthcare-domain business logic. It is not certified medical software and is not intended to handle real patient data in production without further compliance work.
