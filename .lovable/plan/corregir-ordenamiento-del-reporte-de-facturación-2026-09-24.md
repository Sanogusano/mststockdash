# Corregir ordenamiento del Reporte de Facturación

## Cambios
- Crear un comparador único y seguro para fechas ISO, números, texto y valores nulos.
- Ordenar siempre una copia de las filas cargadas y conservar los nulos al final en ambas direcciones.
- Mantener `Fecha pedido` descendente como orden inicial y habilitar las cuatro columnas ordenables.
- Proteger el ordenamiento con fallback a las filas originales si ocurre una excepción.
- Desacoplar el botón Excel del resultado del ordenamiento; dependerá únicamente de las filas cargadas y del progreso de exportación.

## Verificación
- Comprobar tipos y compilación.
- Confirmar en el código las cuatro columnas y el orden inicial solicitado.
