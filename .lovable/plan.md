# Actualizar Reporte de Facturación

## Alcance
- Adaptar las consultas de detalle y resumen a los nuevos parámetros de canal, zona y tienda.
- Reemplazar la nota anterior por el corte automático de ventas, facturas y sincronización de NetSuite.
- Mantener paginación, búsqueda limitada y descarga completa por bloques.

## Interfaz
- Hacer que esta pantalla use todo el ancho disponible.
- Organizar los filtros de forma adaptable e incorporar Zona y Tienda dependiente.
- Sustituir el resumen por cinco tarjetas clicables para los estados solicitados, incluyendo el valor de diferencias.
- Ampliar la tabla a 2.000 px, fijar anchos y congelar Estado y Pedido durante el desplazamiento horizontal.
- Mostrar gift cards, nuevos estados, método de pago, despacho, valor facturado y diferencia.
- Permitir ordenar por fecha, venta neta, diferencia y días sin facturar.

## Exportación
- Exportar todas las columnas visibles y nuevas, respetando filtros, estado y orden seleccionados.
- Mantener la carga completa en bloques de 1.000 filas y el indicador de progreso.

## Validación
- Verificar compilación, errores de ejecución y estructura visual disponible sin sesión autenticada.
