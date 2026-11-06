/**
 * A dónde se vuelve después de iniciar sesión.
 *
 * `?destino=` viaja en la URL del login, así que cualquiera puede escribirlo y
 * mandar el enlace por correo. Antes se pasaba tal cual a `redirect()`: con
 * `destino=https://sitio-falso.cl/login` la persona entraba con su contraseña
 * de verdad y aterrizaba en una copia que le decía «contraseña incorrecta»
 * para pedírsela otra vez. Es una redirección abierta, el primer paso de un
 * phishing que pasa por nuestro propio dominio.
 *
 * Solo se acepta una ruta de este mismo sitio: empieza con `/` y no con `//` ni
 * `/\` —los navegadores leen los dos como «otro dominio»—, y no lleva
 * caracteres de control, que algunos navegadores descartan antes de decidir.
 */
export function destinoSeguro(destino: string | null | undefined): string {
  if (!destino) return '/';
  if (!destino.startsWith('/')) return '/';
  if (destino.startsWith('//') || destino.startsWith('/\\')) return '/';
  const tieneControl = [...destino].some((c) => {
    const codigo = c.charCodeAt(0);
    return codigo < 0x20 || codigo === 0x7f;
  });
  if (tieneControl) return '/';
  if (destino === '/login' || destino.startsWith('/login?')) return '/';
  return destino;
}
