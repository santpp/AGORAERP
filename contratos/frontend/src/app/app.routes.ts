import { Routes } from '@angular/router';
import { soloAdmin, sesionActiva } from './core/sesion.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'contratos', pathMatch: 'full' },
  {
    path: 'entrar',
    loadComponent: () => import('./features/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'contratos',
    canActivate: [sesionActiva],
    loadComponent: () => import('./features/contratos/lista').then((m) => m.ListaContratos),
  },
  {
    path: 'usuarios',
    canActivate: [soloAdmin],
    loadComponent: () => import('./features/usuarios/usuarios').then((m) => m.UsuariosPage),
  },
  {
    path: 'registro',
    canActivate: [soloAdmin],
    loadComponent: () => import('./features/registro/registro').then((m) => m.RegistroPage),
  },
  {
    path: 'contratos/nuevo',
    canActivate: [sesionActiva],
    loadComponent: () => import('./features/contratos/nuevo').then((m) => m.NuevoContrato),
  },
  {
    path: 'contratos/:uid',
    canActivate: [sesionActiva],
    loadComponent: () => import('./features/contratos/detalle').then((m) => m.DetalleContrato),
  },
  { path: '**', redirectTo: 'contratos' },
];
