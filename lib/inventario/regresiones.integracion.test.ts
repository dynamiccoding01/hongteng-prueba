/**
 * Guardias de las regresiones corregidas en la revisión crítica.
 *
 * Cada `it` fue en su momento un fallo real y comprobado contra la base: aquí
 * quedan para que no vuelvan. Corre contra el proyecto Supabase real y se omite
 * solo si no hay `.env.local` (por eso pasa en CI sin credenciales), igual que
 * el resto de los `*.integracion.test.ts`.
 *
 * Identificadores según REVISION_CRITICA.md.
 */

import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { descuentoParaSubtotal } from '@/lib/ventas/descuento';

const hayCredenciales = existsSync('.env.local');

type Fila = Record<string, unknown>;
let consultar: (sql: string) => Promise<Fila[]>;

const SUFIJO = Date.now().toString(36).toUpperCase();
const CODIGO = `TESTREG-${SUFIJO}`;

let categoriaId: number;
let productoId: number;
let varianteId: number;
let bodegaId: number;
let zonaId: number;
let proveedorId: number;
let clienteId: number;
let monedaId: number;
let adminId: string;
/** Documentos creados por los tests, para poder limpiarlos pase lo que pase. */
const ventas: number[] = [];
const importaciones: number[] = [];

const n = (fila: Fila | undefined, campo: string): number => Number(fila?.[campo]);

/** Ejecuta con la identidad de un Administrador: las `fn_*` piden permisos. */
async function comoAdmin(sql: string): Promise<Fila[]> {
  return consultar(
    `select set_config('request.jwt.claims', '{"sub":"${adminId}","role":"authenticated"}', false); ${sql}`,
  );
}

/** Crea una nota de venta en BORRADOR y la apunta para la limpieza. */
async function nuevaVenta(): Promise<number> {
  const [venta] = await consultar(
    `insert into venta (cliente_id, moneda_id) values (${clienteId}, ${monedaId}) returning id`,
  );
  const id = n(venta, 'id');
  ventas.push(id);
  return id;
}

/** Crea una importación en BORRADOR y la apunta para la limpieza. */
async function nuevaImportacion(): Promise<number> {
  const [imp] = await consultar(
    `insert into importacion (proveedor_id, moneda_id) values (${proveedorId}, ${monedaId}) returning id`,
  );
  const id = n(imp, 'id');
  importaciones.push(id);
  return id;
}

describe.runIf(hayCredenciales)('regresiones abiertas', { timeout: 180_000 }, () => {
  beforeAll(async () => {
    ({ consultar } = await import('../../scripts/api-supabase'));

    const [admin] = await consultar(
      `select u.id from usuario u join rol r on r.id = u.rol_id
        where r.nombre = 'Administrador' and u.activo limit 1`,
    );
    if (!admin) throw new Error('No hay un usuario Administrador activo para probar');
    adminId = String(admin.id);

    const [cat] = await consultar(
      `insert into categoria (codigo, nombre_es, unidad_medida_default_id)
       values ('${CODIGO}', 'Cat regresion', (select id from unidad_medida where codigo = 'PAR'))
       returning id`,
    );
    categoriaId = n(cat, 'id');
    const [prod] = await consultar(
      `insert into producto (codigo, categoria_id, unidad_medida_id)
       values ('${CODIGO}', ${categoriaId}, (select id from unidad_medida where codigo = 'PAR'))
       returning id`,
    );
    productoId = n(prod, 'id');
    const [vari] = await consultar(
      `insert into producto_variante (producto_id, unidades_por_caja)
       values (${productoId}, 10) returning id`,
    );
    varianteId = n(vari, 'id');
    const [bod] = await consultar(
      `insert into bodega (codigo, nombre) values ('${CODIGO}', 'Bodega regresion') returning id`,
    );
    bodegaId = n(bod, 'id');
    const [zon] = await consultar(
      `insert into zona (bodega_id, codigo) values (${bodegaId}, '${CODIGO}') returning id`,
    );
    zonaId = n(zon, 'id');
    const [prov] = await consultar(
      `insert into proveedor (codigo, nombre) values ('${CODIGO}', 'Prov regresion') returning id`,
    );
    proveedorId = n(prov, 'id');
    const [cli] = await consultar(
      `insert into cliente (codigo, nombre) values ('${CODIGO}', 'Cli regresion') returning id`,
    );
    clienteId = n(cli, 'id');
    const [mon] = await consultar(`select id from moneda where codigo = 'USD'`);
    monedaId = n(mon, 'id');

    // Existencia con la que trabajar, sin pasar por una importación.
    await consultar(
      `insert into movimiento (variante_id, zona_id, tipo, cajas)
       values (${varianteId}, ${zonaId}, 'ENTRADA', 100)`,
    );
  });

  afterAll(async () => {
    if (!varianteId) return;
    const lista = (ids: number[]): string => (ids.length ? ids.join(', ') : '0');
    // Si el montaje se corto a la mitad, los ids de lo ultimo que crea pueden
    // no existir. El 0 no coincide con ninguna fila y deja pasar el resto de la
    // limpieza, que es justo lo que hay que borrar en ese caso.
    const id = (valor: number | undefined): number => valor ?? 0;
    await consultar(`
      -- Solo para esta sesion, que muere con la peticion: un "alter table
      -- ... disable trigger" que no llegue a su "enable" deja la base REAL del
      -- cliente sin sus protecciones, en silencio.
      set session_replication_role = replica;
      delete from movimiento where variante_id = ${varianteId};
      delete from stock where variante_id = ${varianteId};
      delete from importacion_detalle where importacion_id in (${lista(importaciones)});
      delete from importacion where id in (${lista(importaciones)});
      delete from venta_detalle where venta_id in (${lista(ventas)});
      delete from venta where id in (${lista(ventas)});
      delete from lista_precio_item where variante_id = ${varianteId};
      delete from cliente where id = ${id(clienteId)};
      delete from proveedor where id = ${id(proveedorId)};
      delete from producto_variante where id = ${varianteId};
      delete from producto where id = ${id(productoId)};
      delete from zona where id = ${id(zonaId)};
      delete from bodega where id = ${id(bodegaId)};
      delete from categoria where id = ${id(categoriaId)};
    `);
  });

  it('G-01: confirmar una venta con líneas sin precio se rechaza', async () => {
    /*
     * Hasta 0032, `fn_confirmar_venta` comprobaba permiso, estado y que hubiera
     * detalle, pero no que las líneas tuvieran precio. Una línea sin
     * `precio_caja` se confirmaba, descontaba stock y salía de bodega; su
     * `subtotal` era null y las pantallas de reportes lo sumaban como 0
     * (`Number(... ?? 0)`). Mercadería despachada que no figuraba en ninguna
     * cifra de venta, y sin ninguna pantalla donde se viera la diferencia.
     */
    const ventaId = await nuevaVenta();
    await consultar(
      `insert into venta_detalle (venta_id, variante_id, zona_id, cajas)
       values (${ventaId}, ${varianteId}, ${zonaId}, 2)`,
    );

    await expect(comoAdmin(`select fn_confirmar_venta(${ventaId})`)).rejects.toThrow(/precio/i);
  });

  it('G-02: confirmar una importación con líneas sin costo se rechaza', async () => {
    /*
     * La simétrica, y la que hizo visible REP-07: `v_compras_detalle.monto_clp`
     * es null cuando falta `costo_caja`. El encabezado del reporte anunciaba un
     * total del período que no incluía esas compras y nada decía que faltaban.
     * Las históricas siguen ahí y ahora se cuentan aparte (`sin_importe`).
     */
    const importacionId = await nuevaImportacion();
    await consultar(
      `insert into importacion_detalle (importacion_id, variante_id, zona_id, cajas)
       values (${importacionId}, ${varianteId}, ${zonaId}, 2)`,
    );

    await expect(comoAdmin(`select fn_confirmar_importacion(${importacionId})`)).rejects.toThrow(
      /costo/i,
    );
  });

  it('G-03: el descuento que calcula la aplicación cabe en el CHECK de la base', async () => {
    /*
     * Extremo a extremo del fallo D-01: `descuentoParaSubtotal` redondeaba el
     * bruto a 4 decimales y la base multiplica exacto (2 + 4 decimales). Con
     * 0,05 cajas a 20,0010 el descuento salía 1,0001 contra un importe real de
     * 1,000050, el subtotal generado daba −0,0001 y
     * `venta_detalle_descuento_ck` rechazaba el insert: quien digitaba veía un
     * error de constraint en crudo y no podía guardar la línea. Ahora la cuenta
     * se hace en enteros y trunca a la baja.
     */
    const rebaja = descuentoParaSubtotal(0.05, 20.001, 0);
    if ('error' in rebaja) throw new Error(rebaja.error);

    const ventaId = await nuevaVenta();
    await expect(
      consultar(
        `insert into venta_detalle (venta_id, variante_id, zona_id, cajas, precio_caja, descuento)
         values (${ventaId}, ${varianteId}, ${zonaId}, 0.05, 20.0010, ${rebaja.descuento})`,
      ),
    ).resolves.toBeDefined();
  });

  it('G-04: `cajas` guarda dos decimales y redondea el resto en silencio (documenta D-02)', async () => {
    /*
     * Este test pasa: está para dejar el hecho por escrito. `cajas` es
     * `numeric(14,2)` y al guardar 1,005 la base deja 1,01, así que el subtotal
     * cobrado ya no sería el acordado. La barrera está en la aplicación —
     * `descuentoParaSubtotal` rechaza una cantidad con más de dos decimales
     * (D-02)— porque la base no puede detectar lo que ya redondeó.
     */
    const ventaId = await nuevaVenta();
    const [fila] = await consultar(
      `insert into venta_detalle (venta_id, variante_id, zona_id, cajas, precio_caja)
       values (${ventaId}, ${varianteId}, ${zonaId}, 1.005, 100) returning cajas`,
    );

    expect(n(fila, 'cajas')).toBe(1.01);
  });

  it('G-07: el resumen del período lo calcula la base y cuadra con el detalle', async () => {
    /*
     * R-01: las páginas de reportes sumaban el período entero en TypeScript
     * sobre una consulta sin `limit`, que PostgREST corta en `db-max-rows` sin
     * decirlo. Desde 0033 la cuenta la hace `fn_compras_resumen`, que devuelve
     * la fila TOTAL primero para que no se pueda perder por un corte.
     */
    const importacionId = await nuevaImportacion();
    await consultar(
      `insert into importacion_detalle (importacion_id, variante_id, zona_id, cajas, costo_caja)
       values (${importacionId}, ${varianteId}, ${zonaId}, 4, 25)`,
    );
    await comoAdmin(`select fn_confirmar_importacion(${importacionId})`);

    const [fecha] = await consultar(`select fecha from importacion where id = ${importacionId}`);
    const dia = String(fecha?.['fecha']).slice(0, 10);

    const filas = await consultar(
      `select agrupacion, clave, cajas, monto_clp, lineas, sin_importe
         from fn_compras_resumen('${dia}', '${dia}')`,
    );

    // El TOTAL va primero: si alguna vez el resto se corta, el total sigue ahí.
    expect(filas[0]?.['agrupacion']).toBe('TOTAL');

    const detalle = await consultar(
      `select coalesce(sum(monto_clp), 0) as monto, count(*) as lineas
         from v_compras_detalle where fecha = '${dia}'`,
    );
    expect(n(filas[0], 'monto_clp')).toBe(n(detalle[0], 'monto'));
    expect(n(filas[0], 'lineas')).toBe(n(detalle[0], 'lineas'));

    // Y las dos agrupaciones suman lo mismo que el total, cada una por su lado.
    for (const agrupacion of ['PROVEEDOR', 'PRODUCTO']) {
      const suma = filas
        .filter((f) => f['agrupacion'] === agrupacion)
        .reduce((s, f) => s + Number(f['monto_clp']), 0);
      expect(suma).toBe(n(filas[0], 'monto_clp'));
    }
  });

  it('G-08: el resumen de ventas también cuadra con su detalle', async () => {
    const filas = await consultar(
      `select agrupacion, monto_clp, lineas from fn_ventas_resumen(null, null)`,
    );
    expect(filas[0]?.['agrupacion']).toBe('TOTAL');

    const [detalle] = await consultar(
      `select coalesce(sum(monto_clp), 0) as monto, count(*) as lineas from v_ventas_detalle`,
    );
    expect(n(filas[0], 'monto_clp')).toBe(n(detalle, 'monto'));
    expect(n(filas[0], 'lineas')).toBe(n(detalle, 'lineas'));
  });

  it('G-05: `v_compras_detalle` conserva security_invoker (hoy en verde)', async () => {
    /*
     * Es lo único que impide que el reporte de compras enseñe costos y
     * proveedores a quien no tiene `importacion.ver`. Sin esta opción la vista
     * corre con los permisos de quien la creó y la RLS de `importacion` deja de
     * pintar: cualquier usuario autenticado vería todas las compras.
     */
    const [fila] = await consultar(
      `select coalesce(array_to_string(c.reloptions, ','), '') as opciones
         from pg_class c join pg_namespace es on es.oid = c.relnamespace
        where es.nspname = 'public' and c.relname = 'v_compras_detalle'`,
    );

    expect(String(fila?.['opciones'])).toContain('security_invoker=true');
  });

  it('G-06: la migración 0031 concedió `importacion.ver` a Ventas y Consulta (hoy en verde)', async () => {
    /*
     * El reporte de compras depende de este permiso. Si 0031 no se aplicó, la
     * página muestra el aviso de «pídalo en Roles y permisos» y el reporte
     * queda inservible para los dos roles que más lo consultan.
     */
    const filas = await consultar(
      `select r.nombre
         from rol r
         join rol_permiso rp on rp.rol_id = r.id
         join permiso p on p.id = rp.permiso_id
        where p.codigo = 'importacion.ver' and r.nombre in ('Ventas', 'Consulta')
        order by r.nombre`,
    );

    expect(filas.map((f) => String(f['nombre']))).toEqual(['Consulta', 'Ventas']);
  });
});
