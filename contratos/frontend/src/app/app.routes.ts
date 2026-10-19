import { Routes } from '@angular/router';
import { sesionActiva } from './core/sesion.guard';

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
    path: 'contratos/:uid',
    canActivate: [sesionActiva],
    loadComponent: () => import('./features/contratos/detalle').then((m) => m.DetalleContrato),
  },
  { path: '**', redirectTo: 'contratos' },
];
