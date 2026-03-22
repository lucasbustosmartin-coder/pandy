# Monedas del acuerdo (IN / OUT) y derivación

## Definición única (Órdenes, instrumentación, CC)

- **`moneda_in` / Moneda IN** en el catálogo `tipos_operacion` = lo **recibido** en el acuerdo del lado cliente (columna “Recibido” en la orden).
- **`moneda_out` / Moneda OUT** = lo **entregado** (“Entregado” en la orden).

La **instrumentación** (transacciones por defecto cuando la grilla está vacía) y la **cuenta corriente** se construyen a partir de esos montos y monedas, **sin depender solo del código** del tipo cuando el patrón es un **cruce con USD** (ARS, EUR, etc.): se usa `patronTipoCambioOrden(moneda_in, moneda_out)` en `main.js` (compra_usd / vende_usd), misma convención que ARS-USD / USD-ARS.

## Qué sigue siendo específico por reglas / comisiones

- **`reglas_de_negocio`** siguen indexadas por `tipo_operacion_codigo` (+ intermediario). Para tipos nuevos (p. ej. EUR-USD) hace falta matriz en DB o el motor no generará líneas CC automáticas para ese código.
- Lógica de **comisión en CC** en algunos caminos de `saveTransaccion` sigue contemplando sobre todo pares **ARS/USD** explícitos; EUR u otros cruces pueden requerir extensión adicional si el negocio lo pide.

## Referencias

- `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`
- `docs/TIPOS_OPERACION_UNICIDAD_CODIGO.md`
