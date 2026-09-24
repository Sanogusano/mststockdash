# Roadmap

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
- [x] Mostrar esqueletos en la carga inicial y señalar recargas del Reporte de Facturación sin ocultar datos previos.
