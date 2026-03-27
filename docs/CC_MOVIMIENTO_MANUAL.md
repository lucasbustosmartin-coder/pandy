# Movimientos manuales de cuenta corriente (sin orden)

## Idea central

La **cuenta corriente en base** sigue siendo solo:

- **Cliente ↔ empresa** (`movimientos_cuenta_corriente`)
- **Intermediario ↔ empresa** (`movimientos_cuenta_corriente_intermediario`)

En el modal el usuario define el **hecho económico** con **Pagador** y **Cobrador**, pudiendo ser en cada rol:

- **Cliente** (combo)
- **Intermediario** (combo)
- **Empresa** (marca del sistema / `pandy` en datos)

### Dos terceros (sin empresa en el flujo directo)

Ejemplo: **Cliente A** paga y **Cliente B** cobra (compensación, saldos a favor, etc.). No existe una fila “A↔B” en la base: se generan **dos movimientos** con el mismo `manual_grupo_id`:

1. En la CC de **A**: registro coherente con “entrega hacia la empresa” (`cobro_entidad_pandy` en convención de signo).
2. En la CC de **B**: registro coherente con “recibe desde la empresa” (`pago_pandy_entidad`).

Así la empresa **toma posición** con quien pagó y **ajusta** con quien cobró, alineado a cómo Pandi usa saldos a favor/en contra para cerrar operaciones cruzadas.

Lo mismo aplica a combinaciones **cliente ↔ intermediario** (dos patas en las tablas que correspondan).

## Caja

- Solo si en el movimiento participa **explícitamente la empresa** como pagador o cobrador **y** el **modo de pago** es **efectivo**.
- No hay combo de tipo: se usa siempre uno de estos registros en `tipos_movimiento_caja` (creados por script):
  - **Ingreso de Dinero (Mov Manual en CC)** (`direccion = ingreso`) si **cobra la empresa**.
  - **Egreso de Dinero (Mov Manual en CC)** (`direccion = egreso`) si **paga la empresa**.
- Script: `sql/migracion_tipos_caja_cc_manual.sql`. El movimiento en `movimientos_caja` lleva `caja_tipo = efectivo`.
- **Banco/transferencia** y **cheque** no generan movimiento en caja; el modo queda reflejado en el **concepto** (`[Banco]` / `[Cheque]`).

Requiere permiso **`abm_movimientos_caja`** cuando aplica caja.

## Permisos CC

- `registrar_movimiento_cc_manual` o `editar_transacciones` para insertar en tablas CC.

## Base de datos

1. `sql/migracion_cc_movimiento_manual.sql` — `es_movimiento_manual`, `manual_tip_movimiento`, permiso, RLS, y **orden_id / transaccion_id NULL** (patas sin orden).
2. `sql/migracion_cc_manual_pagador_cobrador.sql` — `manual_grupo_id`, `manual_pagador_rol`, `manual_cobrador_rol`, FKs a cliente/intermediario por lado, CHECK de roles.
3. `sql/migracion_tipos_caja_cc_manual.sql` — tipos fijos ingreso/egreso para caja desde CC manual.

Si la base tenía `orden_id` NOT NULL en CC (error *«null value in column orden_id»* al guardar manual), ejecutá también **`sql/migracion_cc_movimientos_orden_id_nullable.sql`** (o volvé a correr el bloque §4 de `migracion_cc_movimiento_manual.sql`).

Ejecutar los scripts necesarios en Supabase SQL Editor.

## Listados y columnas Pagador / Cobrador

Si la fila tiene `manual_pagador_rol` y `manual_cobrador_rol`, el front arma los nombres desde esos campos y los combos de id. Las filas antiguas solo con `manual_tip_movimiento` siguen mostrándose con la lógica previa.

## Sincronización por orden

Los sync borran movimientos con `orden_id` de esa orden. Los manuales tienen `orden_id` null y **no** se eliminan al resync.
