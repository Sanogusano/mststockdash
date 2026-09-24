# Compactar Reporte de Facturación

## Cambios
- Reducir la tabla visible de 21 a 8 columnas agrupadas: Estado, Pedido, Ubicación, Fechas, Factura, Venta, Facturado y Responsable.
- Mostrar en cada celda un valor principal y su contexto secundario, conservando badges, alertas, CUFE y nota crédito.
- Comparar valores con IVA usando `venta_total`; expresar diferencias como “Falta facturar” o “Facturado de más” solo cuando superen el 2%.
- Mantener un ancho mínimo de 1.100 px y retirar la congelación necesaria para la tabla anterior.
- Habilitar orden por Estado, Fecha pedido, Venta y Facturado por diferencia.
- Conservar el Excel sin agrupación, con sus 21 datos separados, usando Venta total con IVA en la columna de venta.

## Validación
- Confirmar que la carga conserva los ocho encabezados y que la pantalla compila sin errores.
