# Roadmap

- [x] Actualizar Factura a y Comprador en las cuatro pestañas y elegir documento ambiguo en la vista previa NetSuite, conservando estados y controles existentes; probado con respuestas de prueba, pendiente creación real por la limitación de sesión ya registrada.

- [x] Agregar creación de cliente NetSuite en Pendientes de Facturación: vista previa, confirmación, errores y recarga usando la función existente y controles compartidos.
- [ ] Verificar creación NetSuite con sesión y datos reales: Supabase externo sin sesión disponible; no se ejecutan creaciones reales sin revisión del cliente.

- [x] Ajustar Mayoristas: tres donas, ranking a ancho completo, segmentos RFM y filtros de clientes, productos sin venta con detalle y Excel; conservar los bloques protegidos. Verificación visual con datos de prueba en escritorio/celular; acceso real redirige a login.

- [x] Agregar pestaña Cartera en Mayoristas: saldos actuales, detalle por cliente, recaudo del período, gráfico mensual y Excel; mantener RPC y demás pestañas. 24 pruebas aprobadas; vista móvil/escritorio, detalle y archivos Excel verificados con datos de prueba.
- [ ] Verificar Cartera con sesión y datos reales: Supabase externo sin sesión disponible; la ruta real redirige a login. Las cuatro RPC existentes permiten ejecución authenticated.

- [x] Ajustar solo Mayoristas: donas compartidas, medallero de clientes, tabla de vendedoras sin variación anual y productos con colección/vida agrupadas; retirar concentración top 3. Verificado en 375px y 1280px con datos de prueba.

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
- [x] Pestaña "Órdenes" en Mayoristas (junto a "Venta por Cliente"): KPIs Pedido vs. Facturado/No despachado/Pendientes/Duplicados, gráfico mensual barras+línea, tablas por agrupación, pendientes, no despachadas y duplicados plegables; filtros periodo del Resumen + vendedora. Controles 2026 verificados contra la base (97,3% · $633,0M · 105 duplicados · Lorena 99,5% · Tatiana 93,2%). Typecheck y 13 pruebas OK.
- [x] Cuarta pestaña "Facturado a Cliente Mostrador" en Pendientes de Facturación: estado facturado_mostrador con pedido, fecha, razón social, documentos Qikify/Empresa, origen, factura y factura_cliente; filtro por origen con "Pidió factura" por defecto y tarjeta con total + cantidad que pidió factura. Control real: 234 registros, 12 de origen etiqueta. Typecheck OK y 47 pruebas aprobadas.
- [ ] Verificar la pestaña Facturado a Cliente Mostrador con sesión real: Supabase externo sin sesión disponible; la ruta autenticada redirige a login.
