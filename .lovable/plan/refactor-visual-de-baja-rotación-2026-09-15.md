# Refactor visual de Baja Rotación

## Objetivo
Mejorar la legibilidad de la tabla y sus controles sin modificar consultas, lógica de datos, filtros existentes ni exportaciones.

## Cambios
- Dar ancho mínimo a la tabla, fijar anchos por columna y habilitar desplazamiento horizontal real.
- Mantener fotos y placeholders cuadrados, sin deformación.
- Integrar el descuento vigente bajo el precio y eliminar su columna independiente.
- Usar las tarjetas como único selector de nivel, agregar “Sin distribuir” cuando corresponda y ofrecer limpiar el nivel activo.
- Reorganizar los filtros restantes en cuatro grupos, con ambos interruptores juntos.
- Centralizar los canales de stock y explicar cada icono mediante ayudas emergentes en tabla y detalle por talla.
- Mover el proveedor de ayudas emergentes al nivel de toda la página.
- Limitar visualmente la acción sugerida a dos líneas, mostrando el texto completo al pasar el cursor.
- Fijar la cabecera de tabla, ajustar capas y mantener la paginación visible según resultados.
- Alinear filas arriba y usar cifras tabulares en columnas numéricas.

## Validación
- Confirmar compilación limpia.
- Revisar visualmente la tabla en la vista actual, incluyendo scroll horizontal, fotos, cabecera fija, filtros y ayudas emergentes.
