# Rediseño de precios en Análisis por Línea 360

## Cambios
- Reordenar la celda **Precios** para destacar primero el precio de venta en negrita.
- Mostrar debajo el precio de lista en gris; en la tabla principal usar el rango `pvp_min – pvp_max` y en el detalle por producto usar el precio de lista individual.
- Presentar el descuento en una etiqueta rectangular con borde y formato decimal colombiano.
- Aplicar señal ámbar cuando el descuento sea mayor a 30% y roja cuando sea mayor a 50%; mantener un estilo neutro para descuentos menores.
- Actualizar los encabezados y la nota explicativa para que coincidan con el nuevo orden visual.

## Validación
- Confirmar que la tabla principal recibe y muestra las 33 líneas actuales, sin filtros activos.
- Revisar la tabla y el detalle por producto en la vista activa, incluyendo alineación y legibilidad.
- Verificar que la aplicación compile sin errores.

## Fuera de alcance
- No se modificará la función de datos ni la clasificación de categorías, ya corregidas en base.
