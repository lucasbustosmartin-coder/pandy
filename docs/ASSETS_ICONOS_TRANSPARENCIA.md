# Iconos de moneda y cheque (fondo transparente)

Los archivos en `assets/`:

- `Icono_Dolar.avif`
- `Icono_Euro.avif`
- `Icono_ARS.webp`
- `Icono_Cheques.png`

se pueden **regenerar con canal alpha** quitando el fondo claro típico (blanco/gris) sin tocar a mano cada PNG.

## Cómo

Desde la raíz del repo (con dependencias instaladas: `npm i`):

```bash
npm run assets:iconos-transparentes
```

Equivale a:

```bash
node scripts/quitar-fondo-blanco-iconos.js
```

### Opciones

| Opción | Efecto |
|--------|--------|
| `--dry-run` / `-n` | Solo muestra tamaños; no escribe archivos |
| `--lum-min=N` | Luminancia mínima para considerar “claro” (default 218) |
| `--sat-max=N` | Saturación máxima (max−min RGB) para “casi gris” (default 38) |
| `--dist=N` | Distancia² al blanco puro ≤ N → fondo (default 1800) |

Si se come parte del dibujo (muy claro y tocando el borde), subí `--sat-max` o bajá `--lum-min`. Si queda halo blanco, bajá `--dist` o `--sat-max`.

## Algoritmo

Inundación (flood fill) **desde el borde de la imagen**: solo los píxeles conectados al exterior que cumplen “fondo claro” pasan a alpha 0. Así suele evitarse agujerear zonas claras **interiores** del símbolo que no tocan el borde.

## Dependencia

`sharp` está en `devDependencies` del proyecto (solo para este script).
