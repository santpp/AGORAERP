import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SesionService } from './sesion';

/** Deja pasar solo si hay sesión activa; si no, manda a la pantalla de entrada. */
export const sesionActiva: CanActivateFn = async () => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  if (sesion.usuario()) {
    return true;
  }
  const usuario = await sesion.cargar();
  return usuario ? true : router.createUrlTree(['/entrar']);
};
