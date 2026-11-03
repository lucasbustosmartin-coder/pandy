# Foto gemelos CC en producción (concilia con Saldos)

Excel: **`docs/CC_DUPLICADOS_PROD_SALDO.xlsx`** (regenerar: `node scripts/crear-excel-duplicados-cc-prod.js`).

Foto **2026-11-03** de Pandy (prod). Lista los movimientos **vivos duplicados** que Saldos ya sumaba y el Excel de Movimientos **ocultaba**.

- **Resumen_vs_Saldos:** saldo de hoy vs lo que daba el Excel viejo.
- **Grupos / Filas_vivas:** las dos copias (Rou, Dacharry, DOC, Mateo, Pablo Franck).
- En Rou y Dacharry el Excel viejo **no** coincidía con Saldos. En DOC, Mateo y Pablo Franck las 2ª copias se anulan entre sí (saldo igual).
- Al desplegar el sync **solo** toca **576** y **788**. 28 y 42 quedan congeladas (igual que 23, 41 y 106).

Desde el cambio en `main.js`, la solapa **Movimientos** y su Excel listan **todas** las filas (como el ojito). La suma tiene que dar igual que Saldos, con o sin gemelos.
