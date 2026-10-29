# Mi Plata 💸

App web instalable (PWA) de finanzas personales y del hogar: registras lo que ganas y gastas en segundos y la app te dice **cuánto puedes gastar hoy** sin romper tus prioridades. Pensada para Chile: pesos sin decimales, hora de Santiago y comercios chilenos.

Especificación completa: [doc "Mi Plata — Especificación"](https://claude.ai/artifact/8SN7trCGMDUotUiFHBYsJF).

**App en vivo:** https://mi-plata-nu.vercel.app

## Infraestructura

| Pieza | Dónde | Notas |
|---|---|---|
| Base de datos + login | Supabase, proyecto `mi-plata` (São Paulo) | Migraciones de `supabase/migrations/` aplicadas |
| App | Vercel, equipo DeTodito, proyecto `mi-plata` | Funciones en São Paulo (`gru1`), junto a la base |

### Pendiente en paneles (no se puede hacer por API)
1. **Supabase → Authentication → URL Configuration:** *Site URL* = `https://mi-plata-nu.vercel.app`; *Redirect URLs*: `https://mi-plata-nu.vercel.app/auth/callback` y `http://localhost:3000/auth/callback`.
2. **Correo de confirmación:** el correo incluido en Supabase solo envía a miembros del equipo de Supabase. Para uso en el hogar: desactivar *Confirm email* (Authentication → Sign In / Providers → Email) o usar Google. Para vender: SMTP propio (ej. Resend) en Authentication → Emails → SMTP.
3. **Google (opcional):** Authentication → Providers → Google con un Client ID de Google Cloud.

## Fase 2 — Documentos con IA ✅

| Pantalla | Qué hace |
|---|---|
| **Subir** (`/subir`, desde + Agregar) | Arrastra, elige o toma foto de cualquier documento financiero: boletas, facturas, cartolas de tarjeta o cuenta (PDF), Excel/CSV del banco, comprobantes de transferencia, liquidaciones de sueldo, cuentas de servicios. Las fotos se achican en el teléfono y las HEIC se convierten a JPG. |
| **Por revisar** (`/revisar`) | La IA propone los movimientos; corriges comercio, monto, fecha y categoría, eliges la cuenta y aceptas. Nada se guarda sin tu confirmación. |

- **Lector:** Claude (`claude-opus-5-5`) con salida JSON validada (zod). PDF e imágenes van directo; Excel (.xlsx), CSV en UTF-8 o Latin-1, y los ".xls" que en realidad son HTML se convierten a texto. El Excel antiguo (.xls binario) pide guardarlo como .xlsx.
- **Anti-duplicados:** mismo monto, fecha a ±3 días y comercio parecido → viene desmarcado y avisado.
- **La app aprende:** al aceptar, guarda comercio → categoría; la próxima vez esa regla manda sobre la sugerencia de la IA.
- **Privacidad:** archivos en un bucket privado de Supabase, en la carpeta del hogar (RLS en Storage); se abren con enlaces firmados de 60 s.
- **Costo:** se paga por uso de la API de Claude; una boleta cuesta del orden de centavos de dólar y una cartola larga algo más.
- **Requiere** la variable `ANTHROPIC_API_KEY` en Vercel. Sin ella, la subida funciona pero la lectura avisa que la IA no está activada.

## Fase 1 — Base ✅

| Pantalla | Qué hace |
|---|---|
| **Inicio** | "Puedes gastar hoy", plata por asignar, saldo disponible y deudas, avance del mes, próximos pagos de tarjetas (7 días), últimos movimientos |
| **+ Agregar** | Registro rápido que entiende `café 2500`, `uber 4.500`, `5 lucas almuerzo` o `+850000 sueldo`, y sugiere la categoría |
| **Presupuesto** | Sobres en Esencial → Importante → Opcional, reparto automático, mover plata y "cubrir" un sobre en rojo |
| **Movimientos** | Lista por día con filtros (mes, cuenta, categoría) y buscador; editar y borrar |
| **Cuentas** | Efectivo, cuenta corriente/vista, tarjetas (cupo, facturación, pago) y deudas; patrimonio neto |
| **Ajustes** | Hogar, plantilla 50/30/20, invitar a la familia con código, categorías y prioridades |

**Hogar desde el día 1:** todo pertenece a un *hogar*; puedes invitar a tu familia con un código y comparten cuentas y sobres. La seguridad (RLS de Postgres) impide que un hogar vea datos de otro.

### Cómo se calcula

- **Por asignar** = ingresos del mes − lo asignado a sobres.
- **Reparto automático:** el primer mes usa la plantilla (50/30/20). Después llena Esencial e Importante hasta lo que asignaste el mes anterior, y Opcional recibe lo que queda.
- **Puedes gastar hoy** = lo disponible en sobres Opcionales ÷ días que quedan del mes (hoy incluido).
- **Saldo de cada cuenta** = saldo inicial + suma de sus movimientos (se calcula en la base de datos, nunca se desincroniza).

## Puesta en marcha

### 1. Supabase
> Ya creado: proyecto **mi-plata** (región São Paulo) con todas las migraciones aplicadas. Estos pasos son para recrearlo desde cero.

1. Crea un proyecto en [supabase.com](https://supabase.com) (el plan gratis alcanza).
2. **SQL Editor** → ejecuta, en orden, los archivos de `supabase/migrations/`.
   (o con la CLI: `supabase link` y `supabase db push`)
3. **Authentication → URL Configuration**: *Site URL* = la URL de tu app; en *Redirect URLs* agrega `https://TU-DOMINIO/auth/callback` y `http://localhost:3000/auth/callback`.
4. *(Opcional)* **Authentication → Providers → Google**: actívalo con tu Client ID de Google Cloud.

### 2. Local
```bash
cp .env.example .env.local   # completa URL y publishable key de Supabase
npm install
npm run dev                  # http://localhost:3000
```

### 3. Producción (Vercel)
Importa el repo en Vercel y agrega las mismas variables de `.env.example` (con `NEXT_PUBLIC_SITE_URL` = tu dominio).

## Calidad

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # lógica de negocio + documentos (tipos de archivo, Excel/CSV, duplicados, reglas)
npm run test:db     # migración + seguridad RLS en un Postgres local desechable
```

Pruebas de punta a punta y la **cuenta de prueba permanente**: ver [`docs/PRUEBAS.md`](docs/PRUEBAS.md).

## Estructura

```
supabase/migrations/   esquema SQL, RLS, alta de usuarios, invitaciones
supabase/tests/        prueba de seguridad entre hogares
src/proxy.ts           sesión de Supabase y protección de rutas (Next 16: antes "middleware")
src/lib/               lógica pura (budget, dates, money, quick-entry) + capa de datos (data.ts)
src/app/actions.ts     Server Actions con validación
src/app/(app)/         pantallas privadas
src/app/login/         entrar, crear cuenta, Google
src/lib/documents/     lectura de documentos: tipos, conversión a texto, IA, duplicados y reglas
src/app/api/documentos procesar con IA y abrir el archivo original
```

Stack: Next.js 16 (App Router) · React 19 · Tailwind 4 · Supabase (Postgres + Auth + RLS) · Vitest.

## Próximas fases

1. ~~Base~~ ✅
2. ~~IA lectora~~ ✅ (incluye cartolas, Excel/CSV y anti-duplicados, adelantados de la Fase 3)
3. **Transferencias entre cuentas** (pagar la tarjeta desde la cuenta corriente sin contar el gasto dos veces) y recordar el formato del Excel de cada banco.
4. **Control:** pagos recurrentes, alertas push, metas, cierre de mes con traspaso de saldos, reportes y exportar.
5. **Asistente:** preguntas en lenguaje natural y resumen mensual.
6. **Futuro:** conexión bancaria (Fintoc / Finanzas Abiertas CMF).
