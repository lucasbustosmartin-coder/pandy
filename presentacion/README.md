# Presentación comercial – Pandi

Esta carpeta contiene la **propuesta comercial** y el **presupuesto** del proyecto, redactados como oferta de trabajo (como si la aplicación aún no existiera). Se actualiza cuando se incorporan nuevas funcionalidades o se ajustan precios.

## Contenido

| Archivo | Uso |
|--------|-----|
| **PROPUESTA_COMERCIAL.md** | Guion completo de la presentación: título, slides y tabla de presupuesto. Sirve para armar o actualizar la presentación en PowerPoint (o Google Slides). |
| **Presupuesto** | Está en la **solapa Presupuesto** de `Bitacora_tareas.xlsx`. El PPT lo lee de ahí. Editá horas e importes en la bitácora; al regenerar el PPT se usan esos valores. Las filas nuevas que agregue el código llevan "Sí" en la columna Nuevo para que las formatees en otro color. |
| **index.html** | Versión web de la propuesta: se abre en el navegador para presentar en vivo o exportar a PDF (Imprimir → Guardar como PDF). |
| **Propuesta_Pandi.pptx** | Presentación en PowerPoint (generada por el script). Estilo comercial, paginada, con logo. |
| **crear_presentacion_pptx.py** | Script Python que genera el .pptx. Usa el logo en `Logos/SP_logo.svg` (o `Logos/SP_logo.png` si existe). |

## Cómo generar o actualizar la presentación PowerPoint

Desde la raíz del proyecto:

```bash
pip install -r presentacion/requirements.txt
python presentacion/crear_presentacion_pptx.py
```

Se crea o actualiza `presentacion/Propuesta_Pandi.pptx`. El logo se toma de `Logos/SP_logo.svg`; si tenés `Logos/SP_logo.png`, se usa ese. Si no se puede convertir el SVG (p. ej. falta la librería Cairo), el script genera un logo tipo SP con Pillow.

## Cómo actualizar

- Al sumar funcionalidades relevantes al producto: actualizar **PROPUESTA_COMERCIAL.md** (slides) y el array **presupuesto** en `scripts/crear-bitacora-excel.js` (solapa Presupuesto). Para filas nuevas, poner **"Sí"** en la columna Nuevo para formatearlas en otro color en Excel.
- Regenerar o ajustar **index.html** si cambia la estructura de la propuesta.
- Según la regla **bitacora-tareas**: al completar tareas que impacten el alcance comercial, actualizar también la bitácora en `scripts/crear-bitacora-excel.js` y, si corresponde, los archivos de esta carpeta.

## Tarifa de referencia

Presupuesto calculado con **USD 38/h** (desarrollador freelance, Argentina). Ajustar en `presupuesto.csv` y en la tabla de PROPUESTA_COMERCIAL.md si se cambia la tarifa.
