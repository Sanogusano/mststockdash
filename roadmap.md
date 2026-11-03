# Roadmap

- [x] Reutilizar la presentación ejecutiva en Mayoristas sin cambiar sus RPC; comprobar selector y error visible en escritorio y móvil con datos de prueba.

- [x] Evitar desbordamiento móvil y revisar a 375px Resumen Ejecutivo, Precios monitor/lotes, Estado del Sistema (Integridad) y Logística/Traslados con datos de prueba.
- [x] Corregir presupuesto por universo seleccionado usando la misma venta del KPI, sin cambiar RPCs.
- [x] Unificar montos compactos de KPIs, pasar 21 pruebas y confirmar octubre mediante lectura de datos: Tiendas 90,6%, Outlets 85,3%.
- [ ] Verificación autenticada con datos reales de estas pantallas: Supabase externo sin sesión disponible; revisión visual completada con datos de prueba.

- [x] Publicar Participación por Género (tarjeta visible en pestaña Venta Directa)
- [x] Rediseñar tarjeta "Participación por Género": barras por género con escala fija 0–100%, stock atenuado, frase de brecha, rango de fechas en subtítulo, debajo de "Participación por Línea"
- [x] Publicar cambios

- [x] Sustituir Distribución por embudo, tiendas y curva de tallas con RPC existentes y filtros URL.
- [x] Exportar cada nivel a Excel y PDF sin calcular métricas en cliente.
- [x] Verificar compilación y exportaciones PDF/Excel con datos de prueba; PDF revisado visualmente sin cortes ni superposiciones.
- [ ] Verificar navegación autenticada de Distribución: bloqueada por Supabase externo sin sesión de prueba disponible.

- [x] Restaurar desglose SKU por título e identificadores reales y enlaces con filtros.
- [x] Proteger rankings por tienda contra respuestas anteriores y conservar fechas en URL.
- [ ] Ranking agregado por zona: requiere ampliar la RPC (no admite zona ni lista de tiendas); pendiente autorización.

- [x] Refactorizar la presentación de Baja Rotación: tabla amplia, fotos cuadradas, tarjetas de nivel, tooltips, cabecera fija y paginación independiente.

- [x] Mostrar stand-by, ST total, desglose de bodegas y estado Sin liberar en Salud de Producto y sus exportaciones, conservando la carga y ventas.

- [x] Actualizar Reporte de Facturación con filtros de zona/tienda, nuevos estados y columnas, corte automático, orden servidor y exportación completa.
- [x] Alimentar Zona y Tienda del Reporte de Facturación solo con ubicaciones que tuvieron pedidos en el rango activo.
- [x] Proteger el ordenamiento del Reporte de Facturación ante nulos y desacoplar la descarga Excel del render de la tabla.
- [x] Reutilizar el preloader del Resumen Ejecutivo en la carga inicial y señalar recargas del Reporte de Facturación sin ocultar datos previos.
- [x] Enviar estado y búsqueda a la RPC antes de paginar, con debounce y totales coherentes por tarjeta.
- [x] Compactar el Reporte de Facturación a ocho columnas agrupadas y comparar venta/facturación con IVA.
