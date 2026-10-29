# Pruebas

## Cuenta de prueba (producción)

Hay una cuenta permanente en el proyecto Supabase `mi-plata` para probar cambios de punta a punta:

- **Correo:** `prueba-f2@miplata.test` (dominio `.test`, no recibe correos; ya está confirmada)
- **Contraseña:** no está en el repositorio (es público). La tiene el dueño del proyecto; se pasa a las pruebas con `E2E_PASSWORD`.
- **Hogar:** propio y aislado, con las cuentas "Efectivo" y "Visa" (tarjeta de crédito).
- No la borres: los scripts la limpian solos al empezar (borran documentos y movimientos desde la app).

## Comandos

| Comando | Qué prueba | Necesita |
|---|---|---|
| `npm test` | Lógica pura: pesos, fechas de Chile, registro rápido, reparto, documentos (Excel/CSV, duplicados, reglas) | Nada |
| `npm run test:db` | Migraciones + seguridad (RLS) entre hogares, archivos y aceptación de movimientos, en un Postgres local desechable | Postgres instalado |
| `node scripts/e2e/documentos.cjs` | Fase 2 completa: subir Excel / foto / zip → revisar → duplicado → aceptar → la app aprende → borrar | App corriendo + cuenta de prueba + Playwright |
| `node scripts/e2e/humo-produccion.cjs` | Prueba rápida en producción: entra, sube un CSV y limpia | Cuenta de prueba + Playwright |

### Fase 2 en local, sin gastar en la API de Claude

```bash
npm run build
AI_EXTRACTOR=fake npm start            # lector simulado: 3 movimientos fijos
E2E_EMAIL=prueba-f2@miplata.test E2E_PASSWORD=... BASE_URL=http://localhost:3000 \
  node scripts/e2e/documentos.cjs
```

`AI_EXTRACTOR=fake` nunca debe configurarse en Vercel.

### Producción

```bash
E2E_EMAIL=prueba-f2@miplata.test E2E_PASSWORD=... node scripts/e2e/humo-produccion.cjs
```
