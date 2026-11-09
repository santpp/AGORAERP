import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, Usuario } from './api';

/** Estado de la sesión del personal. El usuario solo se guarda en memoria. */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly usuario = signal<Usuario | null>(null);

  cargar(): Promise<Usuario | null> {
    return new Promise((resolver) => {
      this.api.yo().subscribe({
        next: ({ usuario }) => {
          this.usuario.set(usuario);
          resolver(usuario);
        },
        error: () => {
          this.usuario.set(null);
          resolver(null);
        },
      });
    });
  }

  salir(): void {
    this.api.logout().subscribe({ complete: () => this.ir() });
    this.ir();
  }

  private ir(): void {
    this.usuario.set(null);
    this.router.navigateByUrl('/entrar');
  }
}
