/**
 * Guardias estáticas sobre las migraciones (REVISION_CRITICA.md, M-03 … M-05).
 *
 * Los fallos de 0036 tenían algo en común: nada en la base estaba roto, solo
 * faltaba una opción o una línea, y desde la aplicación todo se veía bien
 * porque la aplicación sí preguntaba por el permiso. Se descubren leyendo el
 * SQL, así que estas guardias leen el SQL: reconstruyen, migración por
 * migración, cómo queda cada vista y cada función al final, y exigen la regla.
 *
 * Corren siempre, sin credenciales: no necesitan la base, solo el repositorio.
 * Las de integración (`rls-api.integracion.test.ts`) comprueban lo mismo
 * contra el proyecto real.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CARPETA = join(process.cwd(), 'supabase', 'migrations');

/** Las migraciones en el orden en que se aplican, sin comentarios de línea. */
function migraciones(): { archivo: string; sql: string }[] {
  return readdirSync(CARPETA)
    .filter((archivo) => archivo.endsWith('.sql'))
    .sort()
    .map((archivo) => ({
      archivo,
      sql: readFileSync(join(CARPETA, archivo), 'utf8').replace(/--[^\n]*/g, ''),
    }));
}

/** Estado final de cada vista: ¿corre con la identidad de quien consulta? */
function vistasAlFinal(): Map<string, boolean> {
  const vistas = new Map<string, boolean>();
  const sentencia =
    /create\s+(?:or\s+replace\s+)?view\s+(\w+)([\s\S]*?)\bas\b|alter\s+view\s+(\w+)\s+set\s*\(\s*security_invoker\s*=\s*(true|false)\s*\)|drop\s+view\s+(?:if\s+exists\s+)?(\w+)/gi;

  for (const { sql } of migraciones()) {
    for (const m of sql.matchAll(sentencia)) {
      const [, creada, cabecera, alterada, valor, borrada] = m;
      if (creada) {
        vistas.set(creada, /security_invoker\s*=\s*true/i.test(cabecera ?? ''));
      } else if (alterada) {
        vistas.set(alterada, valor?.toLowerCase() === 'true');
      } else if (borrada) {
        vistas.delete(borrada);
      }
    }
  }
  return vistas;
}

interface Funcion {
  cuerpo: string;
  definer: boolean;
  esTrigger: boolean;
  archivo: string;
}

/**
 * Última definición de cada función. Los cuerpos van entre `$$` y todas las
 * migraciones escriben `language` y `security` antes del `as $$`.
 */
function funcionesAlFinal(): Map<string, Funcion> {
  const funciones = new Map<string, Funcion>();
  const sentencia =
    /create\s+(?:or\s+replace\s+)?function\s+(\w+)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$\s*;|drop\s+function\s+(?:if\s+exists\s+)?(\w+)/gi;

  for (const { archivo, sql } of migraciones()) {
    for (const m of sql.matchAll(sentencia)) {
      const [, nombre, cabecera, cuerpo, borrada] = m;
      if (borrada) {
        funciones.delete(borrada);
        continue;
      }
      if (!nombre) continue;
      funciones.set(nombre, {
        cuerpo: cuerpo ?? '',
        definer: /security\s+definer/i.test(cabecera ?? ''),
        esTrigger: /returns\s+trigger/i.test(cabecera ?? ''),
        archivo,
      });
    }
  }
  return funciones;
}

/**
 * Funciones `security definer` que se pueden llamar desde la API sin
 * preguntar por un permiso, cada una con su razón. Agregar una aquí es una
 * decisión de seguridad: tiene que poder explicarse en una línea.
 */
const SIN_PERMISO_A_PROPOSITO: Record<string, string> = {
  tiene_permiso: 'responde sobre quien llama; la usan las políticas RLS',
  mis_permisos: 'devuelve los permisos de quien llama, para pintar el menú',
  es_superadmin: 'responde sobre quien llama; la usan las políticas RLS',
  es_rol_protegido: 'dice si un rol es protegido; la usan las políticas RLS',
  registrar_en_bitacora: 'escribe a nombre de auth.uid(); sin sesión no se ejecuta (0036)',
  fn_siguiente_correlativo: 'sin EXECUTE para authenticated (0036): solo la llaman otras funciones',
  fn_registrar_acceso: 'toca solo ultimo_acceso, y solo en la fila de quien llama (0036)',
};

describe('M-03: toda vista corre con la identidad de quien consulta', () => {
  it('ninguna vista vigente queda sin security_invoker', () => {
    /*
     * S-03: `v_bitacora`, `v_stock_variante` y `v_resumen_categoria` venían de
     * 0004 sin la opción, y una vista sin ella corre como su dueño, que no pasa
     * por la RLS. `/bitacora` dice «sin bitacora.ver, solo la propia; lo decide
     * RLS» y la RLS no decidía nada: cualquier usuario veía la de todos.
     */
    const vistas = vistasAlFinal();
    expect(vistas.size).toBeGreaterThan(0);

    const sinInvoker = [...vistas].filter(([, invoker]) => !invoker).map(([nombre]) => nombre);
    expect(sinInvoker).toEqual([]);
  });
});

describe('M-04: una función security definer pregunta por el permiso', () => {
  it('toda función que se salta la RLS comprueba un permiso o explica por qué no', () => {
    /*
     * S-04: `fn_anular_movimiento` es `security definer` y no tenía
     * `tiene_permiso`. El único control era un `if` en `acciones.ts`, así que
     * cualquier sesión que llamara la función por la API movía stock.
     * `fn_traspasar` tuvo el mismo fallo y 0011 lo corrigió; esta se quedó atrás.
     */
    const sinPuerta = [...funcionesAlFinal()]
      .filter(([, f]) => f.definer && !f.esTrigger)
      .filter(([nombre]) => !(nombre in SIN_PERMISO_A_PROPOSITO))
      .filter(([, f]) => !/tiene_permiso\s*\(|es_superadmin\s*\(/i.test(f.cuerpo))
      .map(([nombre, f]) => `${nombre} (${f.archivo})`);

    expect(sinPuerta).toEqual([]);
  });

  it('fn_anular_movimiento exige movimiento.anular', () => {
    const anular = funcionesAlFinal().get('fn_anular_movimiento');
    expect(anular?.cuerpo).toMatch(/tiene_permiso\s*\(\s*'movimiento\.anular'\s*\)/);
  });

  it('la lista de excepciones no tiene nombres que ya no existen', () => {
    // Una excepción para una función borrada o renombrada es una excepción
    // que nadie revisa y que el día de mañana cubre a otra con el mismo nombre.
    const funciones = funcionesAlFinal();
    const huerfanas = Object.keys(SIN_PERMISO_A_PROPOSITO).filter((n) => !funciones.has(n));
    expect(huerfanas).toEqual([]);
  });

  it('fn_siguiente_correlativo no se puede llamar desde la API', () => {
    // Cada llamada consume un folio de la serie; un correlativo con huecos no
    // se puede defender ante nadie (0027).
    const todo = migraciones()
      .map((m) => m.sql)
      .join('\n');
    expect(todo).toMatch(
      /revoke\s+execute\s+on\s+function\s+fn_siguiente_correlativo\s*\(\s*text\s*\)\s+from\s+authenticated/i,
    );
  });

  it('anon no hereda EXECUTE de PUBLIC', () => {
    // S-07: quitárselo solo a `anon` no alcanza, porque todo rol hereda lo
    // que tiene PUBLIC, y PostgreSQL da EXECUTE a PUBLIC por omisión.
    const todo = migraciones()
      .map((m) => m.sql)
      .join('\n');
    expect(todo).toMatch(
      /revoke\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+public\s+from\s+public\s*,\s*anon/i,
    );
  });
});

describe('M-05: el estado de un documento solo lo cambia su función', () => {
  it.each(['venta', 'importacion', 'toma_inventario'])('%s lleva el trigger del sello', (tabla) => {
    /*
     * S-05: `tr_*_confirmada_inmutable` impide tocar lo ya confirmado, pero no
     * confirmar a mano. Un `PATCH venta set estado = 'CONFIRMADA'` dejaba la
     * venta cobrada, sin SALIDAS, sin folio y sin la exigencia de precio.
     */
    const todo = migraciones()
      .map((m) => m.sql)
      .join('\n');
    const trigger = new RegExp(
      `before\\s+insert\\s+or\\s+update\\s+on\\s+${tabla}\\s+for\\s+each\\s+row\\s+execute\\s+function\\s+fn_sello_solo_desde_su_funcion\\s*\\(\\s*'BORRADOR'\\s*,\\s*'estado'`,
      'i',
    );
    expect(todo).toMatch(trigger);
  });
});
