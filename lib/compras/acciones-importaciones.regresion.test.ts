/**
 * GUARDIAS · `app/(app)/compras/importaciones/acciones.ts`.
 *
 * Mismo planteamiento que `lib/ventas/acciones-notas.regresion.test.ts`: un
 * cliente de Supabase falso, sin red ni credenciales, para poder afirmar QUÉ
 * se escribe en la base.
 *
 * I-01 e I-02 los encontró el cliente usando el sistema, no una revisión.
 *
 * Identificadores según REVISION_CRITICA.md.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Lo que la acción le mandó hacer a la base. */
interface Escritura {
  tabla: string;
  operacion: 'insert' | 'update' | 'delete';
  valores: Record<string, unknown> | null;
  id?: unknown;
}

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/supabase/server', () => ({
  crearClienteServidor: async () => estado.cliente,
}));

const { editarLineaImportacion, eliminarLineaImportacion } =
  await import('@/app/(app)/compras/importaciones/acciones');

/**
 * Cliente mínimo: apunta la escritura y responde como PostgREST.
 *
 * `filasTocadas = 0` es lo que devuelve cuando la RLS filtra la escritura: no
 * es un error, es un `data: []`. Es el hueco de A-07, y por eso las acciones
 * piden `.select('id')` y miran si volvió vacío.
 */
function clienteFalso(escrituras: Escritura[], filasTocadas = 1) {
  const respuesta = async () => ({
    data: Array.from({ length: filasTocadas }, (_, i) => ({ id: i + 1 })),
    error: null,
  });

  return {
    from(tabla: string) {
      return {
        update: (valores: Record<string, unknown>) => ({
          eq: (_columna: string, id: unknown) => {
            escrituras.push({ tabla, operacion: 'update', valores, id });
            return { select: respuesta };
          },
        }),
        delete: () => ({
          eq: (_columna: string, id: unknown) => {
            escrituras.push({ tabla, operacion: 'delete', valores: null, id });
            return { select: respuesta };
          },
        }),
      };
    },
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
  estado.cliente = clienteFalso(escrituras);
});

describe('I-01 · una línea del borrador se puede quitar', () => {
  /*
   * Lo que pasaba: `compras/importaciones` no tenía ni acción ni botón para
   * sacar una línea. La base sí lo permitía —`tr_detalle_solo_borrador`
   * (0008) contempla el DELETE y solo lo frena con la importación ya
   * confirmada—, pero por arriba no había forma de llegar.
   *
   * El cliente agregó varias veces el mismo artículo y se quedó con un
   * borrador que solo podía confirmar: ingresar a stock cajas que nunca
   * llegaron. La nota de venta sí tenía su «Quitar» desde siempre.
   */
  it('I-01: `eliminarLineaImportacion` borra esa línea del detalle', async () => {
    const r = await eliminarLineaImportacion({}, formulario({ id: '42' }));

    expect(r).toEqual({ ok: 'Línea quitada' });
    expect(escrituras).toEqual([
      { tabla: 'importacion_detalle', operacion: 'delete', valores: null, id: 42 },
    ]);
  });

  it('I-01: sin id no se manda nada a la base', async () => {
    const r = await eliminarLineaImportacion({}, formulario({}));

    expect(r).toEqual({ error: 'Línea no válida' });
    expect(escrituras).toEqual([]);
  });

  /*
   * A-07 aplicado al borrado: sin `importacion.crear` la RLS filtra el DELETE
   * y PostgREST responde que todo salió bien. Sin este control la pantalla
   * diría «Línea quitada» y la línea seguiría ahí.
   */
  it('I-01: si la RLS filtra el borrado, no se dice que se quitó', async () => {
    estado.cliente = clienteFalso(escrituras, 0);

    const r = await eliminarLineaImportacion({}, formulario({ id: '42' }));

    expect(r).toHaveProperty('error');
    expect(r).not.toHaveProperty('ok');
  });
});

describe('I-02 · una línea sin costo se puede arreglar', () => {
  /*
   * El callejón sin salida: `fn_confirmar_importacion` se niega a confirmar
   * si alguna línea viene sin `costo_caja` (0032, y con razón: la mercadería
   * entraría a bodega sin valor). Sin «Editar» ni «Quitar», esa importación
   * no se podía confirmar NI arreglar, y quedaba en BORRADOR para siempre.
   * Es la Importación #163 que reportó el cliente.
   */
  it('I-02: `editarLineaImportacion` escribe el costo que faltaba', async () => {
    const r = await editarLineaImportacion(
      {},
      formulario({ id: '7', zona_id: '3', cajas: '1', costo_caja: '100' }),
    );

    expect(r).toEqual({ ok: 'Línea corregida' });
    expect(escrituras[0]?.valores).toMatchObject({ costo_caja: 100, cajas: 1, zona_id: 3 });
  });

  /*
   * El artículo no se cambia: cambiarlo es otra línea, no una corrección de
   * esta. Aunque venga `variante_id` en el formulario, no se escribe.
   */
  it('I-02: corregir una línea nunca cambia el artículo', async () => {
    await editarLineaImportacion(
      {},
      formulario({ id: '7', zona_id: '3', cajas: '1', costo_caja: '100', variante_id: '999' }),
    );

    expect(escrituras[0]?.valores).not.toHaveProperty('variante_id');
  });

  /*
   * Mismo criterio que `importacion_detalle_margen_ck` en la base. Se
   * comprueba aquí solo para dar el mensaje en castellano; quien de verdad lo
   * impide es la restricción.
   */
  it('I-02: no deja guardar un precio de venta por debajo del costo', async () => {
    const r = await editarLineaImportacion(
      {},
      formulario({ id: '7', zona_id: '3', cajas: '1', costo_caja: '100', precio_venta_caja: '90' }),
    );

    expect(r).toEqual({ error: 'El precio de venta no puede ser menor al costo de compra' });
    expect(escrituras).toEqual([]);
  });

  /*
   * D-02 en la importación: `cajas` es `numeric(14,2)`. Con tres decimales la
   * base redondea sin avisar y entra a stock una cantidad distinta de la que
   * se escribió.
   */
  it('I-02: rechaza una cantidad con más decimales de los que caben', async () => {
    const r = await editarLineaImportacion(
      {},
      formulario({ id: '7', zona_id: '3', cajas: '1.005', costo_caja: '100' }),
    );

    expect(r).toHaveProperty('error');
    expect(escrituras).toEqual([]);
  });

  /* A-07: la RLS filtra el UPDATE y PostgREST no lo llama error. */
  it('I-02: si la RLS filtra la corrección, no se dice que se guardó', async () => {
    estado.cliente = clienteFalso(escrituras, 0);

    const r = await editarLineaImportacion(
      {},
      formulario({ id: '7', zona_id: '3', cajas: '1', costo_caja: '100' }),
    );

    expect(r).toHaveProperty('error');
    expect(r).not.toHaveProperty('ok');
  });
});
