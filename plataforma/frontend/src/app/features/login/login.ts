import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api';
import { SesionService } from '../../core/sesion';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  /** Atmósferas del lado izquierdo; cambian despacio, sin texto ni controles. */
  protected readonly escenas = ['escena--crepusculo', 'escena--noche', 'escena--bruma', 'escena--brasa'];

  protected correo = '';
  protected clave = '';
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly actual = signal(0);

  private temporizador: ReturnType<typeof setInterval> | undefined;
  private readonly intervaloMs = 12000;

  ngOnInit(): void {
    const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducirMovimiento) {
      this.temporizador = setInterval(() => {
        this.actual.update((i) => (i + 1) % this.escenas.length);
      }, this.intervaloMs);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.temporizador);
  }

  protected entrar(): void {
    if (this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.error.set('');
    this.api.login(this.correo.trim(), this.clave).subscribe({
      next: ({ usuario }) => {
        this.sesion.usuario.set(usuario);
        this.router.navigateByUrl('/contratos');
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.enviando.set(false);
      },
    });
  }
}
