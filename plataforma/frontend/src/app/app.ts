import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { SesionService } from './core/sesion';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  /** En la pantalla de entrada no se muestra la cabecera: el fondo ocupa toda la pantalla. */
  protected readonly enEntrar = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/entrar')),
    ),
    { initialValue: this.router.url.startsWith('/entrar') },
  );

  protected salir(): void {
    this.sesion.salir();
  }
}
