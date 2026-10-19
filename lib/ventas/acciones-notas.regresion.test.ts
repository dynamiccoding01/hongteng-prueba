/**
 * GUARDIAS · `app/(app)/ventas/notas/acciones.ts`.
 *
 * Los `acciones.ts` del sistema no tienen otro test: se comprueban a mano o de
 * rebote en los de integración, que corren contra Supabase y se omiten en CI.
 * Estos los ejercitan con un cliente de Supabase falso, sin red ni
 * credenciales, para poder afirmar QUÉ se escribe en la base.
 *
 * Cubren hallazgos de la revisión crítica, ya corregidos, más A-04, que agrupa
 * decisiones que siempre estuvieron bien y que no deben perderse.
 *
 * Identificadores según REVISION_CRITICA.md.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrecioDeLista } from '@/lib/ventas/precio-lista';

/** Lo que la acción le mandó escribir a la base. */
interface Escritura {
  tabla: string;
  operacion: 'insert' | 'update';
  valores: Record<string, unknown>;
}

/**
 * Estado compartido con los mocks. `vi.hoisted` porque las factorías de
 * `vi.mock` se elevan por encima de los imports.
 */
const estado = vi.hoisted(() => ({
  cliente: null as unknown,
  lista: null as unknown,
  /** VEN-07: tope de descuento del rol de quien vende. `null` = sin tope. */
  tope: null as number | null,
}));

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
// `lib/auth` importa `server-only`, que no existe fuera del runtime de Next.
vi.mock('@/lib/auth', () => ({
  requerirUsuario: async () => ({ descuentoMaximo: estado.tope }),
}));
vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => estado.cliente,
}));
vi.mock('@/lib/ventas/precio-lista', () => ({
  precioDeLista: async () => estado.lista,
}));

const { agregarDetalleVenta, crearVenta, editarLineaVenta } =
  await import('@/app/(app)/ventas/notas/acciones');

/**
 * Cliente de Supabase mínimo: devuelve `fila` en las lecturas y apunta las
 * escrituras. Solo implementa las llamadas que hacen estas acciones.
 */
function clienteFalso(fila: Record<string, unknown> | null, escrituras: Escritura[]) {
  return {
    from(tabla: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: fila, error: null }),
          }),
        }),
        insert: (valores: Record<string, unknown>) => {
          escrituras.push({ tabla, operacion: 'insert', valores });
          return Promise.resolve({ error: null });
        },
        update: (valores: Record<string, unknown>) => {
          escrituras.push({ tabla, operacion: 'update', valores });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  };
}

/** Una lista de precios que sí cubre el artículo, en la moneda de la venta. */
function listaCon(precioVenta: number): PrecioDeLista {
  return {
    precioLista: precioVenta,
    monedaLista: 'USD',
    lista: 'Mayorista',
    monedaVenta: 'USD',
    precioVenta,
    tipoCambio: 950,
    precioExacto: precioVenta,
    motivo: 'mismo',
  };
}

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [clave, valor] of Object.entries(campos)) datos.set(clave, valor);
  return datos;
}

let escrituras: Escritura[];

beforeEach(() => {
  escrituras = [];
  estado.lista = null;
  estado.tope = null;
  estado.cliente = clienteFalso(null, escrituras);
});

describe('A-01 · corregir una línea no puede borrar la rebaja acordada', () => {
  /*
   * La línea 1 se cerró en 5.900 sobre un bruto de 5.950: `descuento = 50`.
   * El vendedor entra a cambiarle la zona de despacho y el formulario no manda
   * `subtotal` (el campo está deshabilitado mientras no hay bruto, y una
   * petición armada a mano tampoco lo lleva). `editarLineaVenta` interpreta
   * «sin subtotal» como «sin descuento» y escribe `descuento: 0`: la rebaja
   * pactada con el cliente desaparece sin un aviso, y el total de la nota sube
   * 50 entre una pantalla y la siguiente.
   *
   * Si la decisión de negocio fuera la contraria —al corregir se recalcula
   * siempre— este test se invierte, pero entonces la acción tiene que DECIRLO
   * en su mensaje de vuelta en vez de callarse.
   */
  it('A-01: sin `subtotal` en el formulario, la rebaja guardada se conserva', async () => {
    estado.cliente = clienteFalso(
      { venta_id: 7, variante_id: 3, cajas: 7, precio_caja: 850, descuento: 50 },
      escrituras,
    );

    const r = await editarLineaVenta(
      {},
      formulario({ id: '1', zona_id: '2', cajas: '7', precio_caja: '850' }),
    );

    expect(r.error).toBeUndefined();
    expect(escrituras[0]?.valores['descuento']).toBe(50);
  });
});

describe('A-02 · corregir una línea no puede borrar el precio guardado', () => {
  /*
   * Mismo camino, otra pérdida: si el campo de precio llega vacío —el cliente
   * no tiene lista, y quien digita lo borró para reescribirlo y envió sin
   * completarlo— `precio = lista?.precioVenta ?? precio_caja ?? null` da null y
   * el update pisa con null un precio que estaba puesto.
   *
   * No queda ahí: `fn_confirmar_venta` no exige precio, así que esa línea se
   * confirma igual y sale del inventario. En los reportes su `subtotal` es
   * null, que las páginas suman como 0 (`Number(f.monto_clp ?? 0)`): mercadería
   * despachada que no aparece en ninguna cifra de venta.
   */
  it('A-02: sin `precio_caja` en el formulario, el precio guardado se conserva', async () => {
    estado.cliente = clienteFalso(
      { venta_id: 7, variante_id: 3, cajas: 7, precio_caja: 850, descuento: 0 },
      escrituras,
    );

    const r = await editarLineaVenta({}, formulario({ id: '1', zona_id: '2', cajas: '7' }));

    expect(r.error).toBeUndefined();
    expect(escrituras[0]?.valores['precio_caja']).toBe(850);
  });
});

describe('A-03 · la fecha de la venta no está validada', () => {
  /*
   * `esquemaCabecera.fecha` es `z.string().trim().optional()`: cualquier texto
   * pasa. Dos consecuencias:
   *
   *   · «mañana» llega a PostgreSQL y vuelve como `invalid input syntax for
   *     type date`, en inglés, dentro del toast.
   *   · «2019-01-01» sí es válida y hace que `fn_documento_tipo_cambio` congele
   *     el tipo de cambio de 2019 en una venta de hoy. Nadie lo teclea, pero la
   *     fecha lo elige.
   *
   * CLAUDE.md lo pide explícitamente: toda entrada validada con Zod en el borde.
   */
  it('A-03a: una fecha que no es fecha se rechaza antes de llegar a la base', async () => {
    const r = await crearVenta(
      {},
      formulario({ cliente_id: '1', moneda_id: '1', fecha: 'mañana' }),
    );

    expect(r.error).toBeDefined();
    expect(escrituras).toHaveLength(0);
  });

  it('A-03b: una fecha con formato correcto sigue pasando', async () => {
    const r = await crearVenta(
      {},
      formulario({ cliente_id: '1', moneda_id: '1', fecha: '2026-09-03' }),
    );

    expect(r.error).toBeUndefined();
    expect(escrituras).toHaveLength(1);
  });
});

describe('A-04 · guardias de lo que ya está bien (hoy en verde)', () => {
  it('A-04a: el precio de la lista manda sobre el que venga del formulario', async () => {
    estado.lista = listaCon(1000);

    await agregarDetalleVenta(
      {},
      formulario({
        venta_id: '7',
        variante_id: '3',
        zona_id: '2',
        cajas: '2',
        precio_caja: '1', // manipulado: se ignora.
      }),
    );

    expect(escrituras[0]?.valores['precio_caja']).toBe(1000);
  });

  it('A-04b: el descuento se calcula contra el precio del servidor, no el enviado', async () => {
    estado.lista = listaCon(1000);

    await agregarDetalleVenta(
      {},
      formulario({
        venta_id: '7',
        variante_id: '3',
        zona_id: '2',
        cajas: '2',
        precio_caja: '1',
        subtotal: '1500',
      }),
    );

    // 2 × 1000 = 2000, acordado en 1500 → rebaja de 500 (no de 0,5).
    expect(escrituras[0]?.valores['descuento']).toBe(500);
  });

  it('A-04c: `subtotal` es columna generada y nunca se escribe', async () => {
    estado.lista = listaCon(1000);

    await agregarDetalleVenta(
      {},
      formulario({ venta_id: '7', variante_id: '3', zona_id: '2', cajas: '2' }),
    );

    expect(escrituras[0]?.valores).not.toHaveProperty('subtotal');
  });
});

describe('A-05 · el tope de descuento del rol se comprueba antes de escribir', () => {
  /*
   * VEN-07 (migración 0035). La barrera es el trigger de la base; la acción lo
   * comprueba antes para poder decir cuánto se puede rebajar en esta línea, en
   * vez de devolver la excepción de PostgreSQL.
   */
  it('A-05a: una rebaja por encima del tope no llega a la base', async () => {
    estado.tope = 10;
    estado.lista = listaCon(1000);

    const r = await agregarDetalleVenta(
      {},
      formulario({
        venta_id: '7',
        variante_id: '3',
        zona_id: '2',
        cajas: '2',
        subtotal: '1500', // 500 de rebaja sobre 2.000: un 25 %.
      }),
    );

    expect(r.error).toContain('10 %');
    expect(escrituras).toHaveLength(0);
  });

  it('A-05b: dentro del tope se guarda con normalidad', async () => {
    estado.tope = 10;
    estado.lista = listaCon(1000);

    const r = await agregarDetalleVenta(
      {},
      formulario({
        venta_id: '7',
        variante_id: '3',
        zona_id: '2',
        cajas: '2',
        subtotal: '1900', // 100 de rebaja sobre 2.000: un 5 %.
      }),
    );

    expect(r.error).toBeUndefined();
    expect(escrituras[0]?.valores['descuento']).toBe(100);
  });

  it('A-05c: al corregir una línea rige el mismo tope', async () => {
    estado.tope = 10;
    estado.cliente = clienteFalso(
      { venta_id: 7, variante_id: 3, cajas: 2, precio_caja: 1000, descuento: 0 },
      escrituras,
    );

    const r = await editarLineaVenta(
      {},
      formulario({ id: '1', zona_id: '2', cajas: '2', precio_caja: '1000', subtotal: '1500' }),
    );

    expect(r.error).toContain('10 %');
    expect(escrituras).toHaveLength(0);
  });
});

describe('A-06 · una línea sin precio no se guarda en silencio', () => {
  /*
   * Lo que le pasó al cliente el 18-10-2026: registró un artículo nuevo, lo
   * vendió, y el precio no salió. No había avería —el artículo no estaba en
   * ninguna lista—, pero la acción devolvía «Detalle agregado» y dejaba la
   * línea con `precio_caja` nulo, así que parecía un fallo del sistema.
   *
   * El silencio era el error: `motivoSinPrecio` devolvía `null` tanto cuando
   * el precio se había resuelto como cuando no había lista que consultar.
   * Ahora cada caso dice qué falta y qué hacer, y la línea no entra sin precio
   * a menos que alguien lo escriba a propósito.
   */
  it('A-06a: el artículo que no está en la lista se rechaza con su motivo', async () => {
    estado.lista = {
      precioLista: null,
      monedaLista: 'USD',
      lista: 'Mayorista USD',
      monedaVenta: 'USD',
      precioVenta: null,
      tipoCambio: 950,
      precioExacto: null,
      motivo: 'articulo_sin_precio',
    } satisfies PrecioDeLista;

    const r = await agregarDetalleVenta(
      {},
      formulario({ venta_id: '7', variante_id: '3', zona_id: '2', cajas: '4' }),
    );

    expect(r.error).toContain('Mayorista USD');
    expect(escrituras).toHaveLength(0);
  });

  it('A-06b: sin ninguna lista que aplicar también se avisa', async () => {
    estado.lista = {
      precioLista: null,
      monedaLista: '—',
      lista: null,
      monedaVenta: 'USD',
      precioVenta: null,
      tipoCambio: 950,
      precioExacto: null,
      motivo: 'sin_lista',
    } satisfies PrecioDeLista;

    const r = await agregarDetalleVenta(
      {},
      formulario({ venta_id: '7', variante_id: '3', zona_id: '2', cajas: '4' }),
    );

    expect(r.error).toContain('lista de precios');
    expect(escrituras).toHaveLength(0);
  });

  it('A-06c: con el precio escrito a mano, la línea sí entra', async () => {
    estado.lista = {
      precioLista: null,
      monedaLista: 'USD',
      lista: 'Mayorista USD',
      monedaVenta: 'USD',
      precioVenta: null,
      tipoCambio: 950,
      precioExacto: null,
      motivo: 'articulo_sin_precio',
    } satisfies PrecioDeLista;

    const r = await agregarDetalleVenta(
      {},
      formulario({ venta_id: '7', variante_id: '3', zona_id: '2', cajas: '4', precio_caja: '35' }),
    );

    expect(r.error).toBeUndefined();
    expect(escrituras[0]?.valores['precio_caja']).toBe(35);
  });
});
