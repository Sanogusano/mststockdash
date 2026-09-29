# Actualizar detalle por talla en Salud de Producto

## Cambios
- Añadir las tarjetas “Unidades vendidas” y “Tiempo de vida” usando las métricas ya devueltas por el reporte principal y el rango activo.
- Consultar `reporte_matriz_tallas_producto` con el producto y la ubicación seleccionada; usar `null` para “Todas las tiendas”.
- Sustituir la disponibilidad en chips por una matriz de tallas con SKU copiable, cargado, demanda, brecha, inventario, cobertura y WOS.
- Aplicar los estados calculados por la RPC para resaltar cada talla, sin recalcular umbrales en pantalla.
- Mantener el bloque de detalle por talla visible aun cuando no haya una tienda filtrada.

## Verificación
- Comprobar compilación y revisar la vista del drawer en escritorio.
- Confirmar que cambiar la tienda vuelve a consultar la matriz con su `location_id`.
