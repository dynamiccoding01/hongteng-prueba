-- ---------------------------------------------------------------------------
-- 0035 · Tope de descuento por rol (VEN-07)
--
-- El descuento por articulo (0029) no tenia limite superior mas alla del
-- importe de la linea: cualquiera con `venta.crear` podia dejar una nota de
-- venta en cero. Quedaba en la bitacora y se veia en la nota impresa, pero
-- nada lo impedia, y una rebaja se descubre cuando ya se despacho.
--
-- El tope es por ROL y no un numero unico del sistema porque el punto es
-- distinguir: un vendedor cierra hasta cierto margen y de ahi para arriba lo
-- autoriza quien puede. Un tope global topa tambien a quien deberia poder
-- pasarse, y entonces se «arregla» subiendolo un rato, que es como se pierde
-- el control de verdad.
--
--   null = sin tope. Es el valor de arranque de todos los roles, para que esta
--   migracion no cambie el comportamiento de nadie hasta que se configure.
--
-- Se aplica en un trigger y no solo en el `acciones.ts` por lo de siempre: la
-- pagina es comodidad, la barrera es la base.
-- ---------------------------------------------------------------------------

alter table rol
  add column descuento_maximo numeric(5, 2)
    check (descuento_maximo is null or (descuento_maximo >= 0 and descuento_maximo <= 100));

comment on column rol.descuento_maximo is
  'VEN-07: porcentaje maximo de descuento por linea de venta que admite este rol. Null = sin tope.';

-- ---------------------------------------------------------------------------
-- La comprobacion
--
-- `security definer` porque lee `rol` con la identidad del usuario que escribe,
-- y la RLS de esa tabla no tiene por que mostrarle su propia fila.
--
-- Sin sesion no se aplica: los scripts y las migraciones corren sin `auth.uid()`
-- y no tienen rol al que topar. No es un agujero —para llegar ahi hay que tener
-- la clave secreta, que ya se salta toda la RLS— y sin esto los tests de
-- integracion y `db:migrar` no podrian escribir una linea.
-- ---------------------------------------------------------------------------
create or replace function fn_venta_detalle_tope_descuento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tope   numeric;
  v_maximo numeric;
begin
  -- Sin rebaja no hay nada que topar; sin precio, `venta_detalle_descuento_ck`
  -- ya exige que el descuento sea 0.
  if coalesce(new.descuento, 0) = 0 or new.precio_caja is null then
    return new;
  end if;

  select r.descuento_maximo into v_tope
    from usuario u
    join rol r on r.id = u.rol_id
   where u.id = auth.uid();

  if v_tope is null then
    return new;
  end if;

  v_maximo := new.cajas * new.precio_caja * v_tope / 100;

  if new.descuento > v_maximo then
    raise exception
      'Su rol admite hasta un % %% de descuento: en esta linea son % como maximo, y se pidieron %',
      v_tope, round(v_maximo, 4), new.descuento;
  end if;

  return new;
end;
$$;

comment on function fn_venta_detalle_tope_descuento is
  'VEN-07: impide que una linea rebaje mas del porcentaje que admite el rol de quien la escribe.';

create trigger tr_venta_detalle_tope_descuento
  before insert or update on venta_detalle
  for each row execute function fn_venta_detalle_tope_descuento();
