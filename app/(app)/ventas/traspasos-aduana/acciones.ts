'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquemaEmision = z.object({
  venta_id: z.coerce.number().int().positive(),
  adquiriente_nombre: z.string().trim().min(1, 'Indique el nombre del adquiriente'),
  adquiriente_rut: z.string().trim().optional(),
  destino: z.string().trim().optional(),
  observaciones: z.string().trim().optional(),
});

/** VEN-03: emite el documento de traspaso (203) de una venta confirmada. */
export async function emitirDocumento(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaEmision.safeParse({
    venta_id: datos.get('venta_id'),
    adquiriente_nombre: datos.get('adquiriente_nombre'),
    adquiriente_rut: datos.get('adquiriente_rut') || undefined,
    destino: datos.get('destino') || undefined,
    observaciones: datos.get('observaciones') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('fn_emitir_documento_traspaso', {
    p_venta_id: analisis.data.venta_id,
    p_adquiriente_nombre: analisis.data.adquiriente_nombre,
    p_adquiriente_rut: analisis.data.adquiriente_rut,
    p_destino: analisis.data.destino,
    p_observaciones: analisis.data.observaciones,
  });

  if (error) return { error: mensajeError(error, 'documento de traspaso') };

  revalidatePath('/ventas/traspasos-aduana');
  return { ok: 'Documento de traspaso emitido' };
}

const esquemaAnulacion = z.object({
  documento_id: z.coerce.number().int().positive(),
  motivo: z.string().trim().min(1, 'Indique el motivo de la anulación'),
});

/** VEN-03: anula un documento de traspaso ya emitido (no se borra). */
export async function anularDocumento(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaAnulacion.safeParse({
    documento_id: datos.get('documento_id'),
    motivo: datos.get('motivo'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('fn_anular_documento_traspaso', {
    p_documento_id: analisis.data.documento_id,
    p_motivo: analisis.data.motivo,
  });

  if (error) return { error: mensajeError(error, 'documento de traspaso') };

  revalidatePath('/ventas/traspasos-aduana');
  return { ok: 'Documento anulado' };
}
