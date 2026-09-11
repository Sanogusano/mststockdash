# Unificar rankings Top/Bottom del Resumen Ejecutivo

## Objetivo
Hacer que los tres rankings y la pantalla de destino consulten exactamente el mismo universo mediante `reporte_top_productos_global`.

## Cambios
- Mantener Top/Bottom 5 con límite 5, sin canal ni ubicación.
- Mantener Zona con límite 20 y la tienda seleccionada.
- Mantener Canal con límite 20, canal y tienda seleccionados.
- Enviar a la RPC el rango completo (`p_desde` y `p_hasta`) cuando exista un rango personalizado.
- Propagar en la navegación orden, período, canal, ubicación y rango personalizado.
- Confirmar que no exista ordenamiento ni filtrado cliente sobre los rankings recibidos.
- Conservar la clasificación `Sin ventas en el período` devuelta por la RPC.

## Verificación
- Revisar las llamadas y enlaces de los tres paneles.
- Ejecutar la validación de tipos y comprobar que la vista compile sin errores.
