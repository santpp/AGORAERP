import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api';
import { SesionService } from '../../core/sesion';

@Component({
  selector: 'app-login',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  protected correo = '';
  protected clave = '';
  protected readonly enviando = signal(false);
  protected readonly error = signal('');

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
