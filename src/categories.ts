// Categorías por defecto, agrupadas a partir de las ~200 variantes sueltas
// que aparecían en la planilla original (se consolidaron duplicados y
// gastos puntuales quedan como "Detalle" dentro de una categoría general).
export const DEFAULT_CATEGORIES: string[] = [
  'Supermercado',
  'Almacén / Verdulería / Carnicería',
  'Restaurantes / Delivery',
  'Cafetería',
  'Auto / Nafta / Cochera',
  'Transporte (Uber/Taxi/SUBE)',
  'Servicios (luz, gas, agua, internet)',
  'Celular',
  'Expensas / Municipal / ARBA',
  'Colegio / Educación',
  'Salud (farmacia, médicos, psicóloga)',
  'Gimnasio / Deportes / Pilates',
  'Indumentaria / Calzado',
  'Peluquería / Estética',
  'Regalos',
  'Viajes',
  'Salidas / Entretenimiento',
  'Hogar / Ferretería',
  'Impuestos',
  'Tarjetas de crédito',
  'Sueldo',
  'Rendimientos / Inversiones',
  'Devoluciones / Reintegros',
  'Otros',
  'Sin categoría',
]

// Palabras clave (sin tildes, minúsculas) para clasificar automáticamente un
// texto libre en una de las categorías de arriba. Se usa tanto para la carga
// por voz como, a futuro, para sugerir categoría en la carga manual.
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Supermercado': ['supermercado', 'super', 'coto', 'carrefour', 'dia', 'jumbo', 'disco', 'vea', 'changuito'],
  'Almacén / Verdulería / Carnicería': [
    'almacen', 'verduleria', 'verduras', 'carniceria', 'carnicero', 'carne', 'pollo', 'fiambreria',
    'pescaderia', 'polleria', 'panaderia', 'rotiseria', 'dietetica', 'granja', 'huevos',
  ],
  'Restaurantes / Delivery': [
    'restaurante', 'restaurant', 'delivery', 'pedidos ya', 'rappi', 'comida', 'almuerzo',
    'cena', 'pizza', 'sushi', 'hamburguesa', 'parrilla', 'bar', 'bares',
  ],
  'Cafetería': ['cafe', 'cafeteria', 'capuccino', 'medialuna', 'facturas'],
  'Auto / Nafta / Cochera': ['nafta', 'combustible', 'ypf', 'shell', 'axion', 'cochera', 'estacionamiento', 'peaje', 'lavadero', 'gomeria', 'service auto'],
  'Transporte (Uber/Taxi/SUBE)': ['uber', 'taxi', 'cabify', 'sube', 'colectivo', 'subte', 'tren'],
  'Servicios (luz, gas, agua, internet)': ['edenor', 'naturgy', 'aysa', 'luz', 'gas', 'agua', 'internet', 'wifi', 'fibertel', 'telecentro'],
  'Celular': ['celular', 'movistar', 'personal', 'claro', 'recarga'],
  'Expensas / Municipal / ARBA': ['expensas', 'municipal', 'arba', 'afip', 'consorcio', 'rentas'],
  'Colegio / Educación': ['colegio', 'escuela', 'cuota colegio', 'utiles', 'curso', 'universidad'],
  'Salud (farmacia, médicos, psicóloga)': ['farmacia', 'medico', 'medica', 'psicologa', 'psicologo', 'dentista', 'odontologo', 'obra social', 'swiss medical'],
  'Gimnasio / Deportes / Pilates': ['gimnasio', 'gym', 'pilates', 'padel', 'futbol', 'natacion', 'deportes'],
  'Indumentaria / Calzado': ['ropa', 'indumentaria', 'zapatillas', 'calzado', 'zara', 'nike', 'adidas'],
  'Peluquería / Estética': ['peluqueria', 'peluquera', 'manicura', 'estetica', 'corte de pelo'],
  'Regalos': ['regalo', 'cumpleanos', 'cumple'],
  'Viajes': ['viaje', 'hotel', 'pasaje', 'vuelo', 'aerolineas'],
  'Salidas / Entretenimiento': ['cine', 'teatro', 'recital', 'entrada', 'salida', 'boliche'],
  'Hogar / Ferretería': ['ferreteria', 'hogar', 'decoracion', 'muebles'],
  'Impuestos': ['impuesto', 'iva', 'ganancias', 'monotributo', 'iibb'],
  'Tarjetas de crédito': ['tarjeta', 'visa', 'mastercard', 'resumen'],
  'Sueldo': ['sueldo', 'salario', 'aguinaldo'],
  'Rendimientos / Inversiones': ['rendimiento', 'inversion', 'plazo fijo', 'dolar', 'dolares', 'cripto'],
  'Devoluciones / Reintegros': ['devolucion', 'reintegro'],
}
