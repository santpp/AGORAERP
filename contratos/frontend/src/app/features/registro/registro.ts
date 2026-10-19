import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { ApiService, Registro } from '../../core/api';
import { fecha } from '../../core/formato';

const ETIQUETAS: Record<string, string> = {
  CREADO: 'Convenio creado',
  ENVIADO: 'Convenio enviado',
  FIRMADO: 'Convenio firmado',
  REVOCADO: 'Enlace revocado',
  NUEVA_VERSION: 'Nueva versión',
  CLIENTE_EDITADO: 'Datos del cliente corregidos',
};

@Component({
  selector: 'app-registro',
  imports: [FormsModule, RouterLink, MatFormFieldModule, MatInputModule],
  templateUrl: './registro.html',
  styleUrl: './registro.scss',
})
export class RegistroPage implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly eventos = signal<Registro[]>([]);
  protected busqueda = '';
  protected readonly busquedaActual = signal('');

  protected readonly visibles = computed(() => {
    const texto = this.busquedaActual().toLowerCase();
    if (!texto) {
      return this.eventos();
    }
    return this.eventos().filter((e) =>
      [this.etiqueta(e.tipo), e.cliente ?? '', JSON.stringify(e.detalle)].join(' ').toLowerCase().includes(texto),
    );
  });

  protected readonly fecha = fecha;

  ngOnInit(): void {
    this.cargar();
  }

  protected etiqueta(tipo: string): string {
    return ETIQUETAS[tipo] ?? tipo.replace(/_/g, ' ').toLowerCase();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.error.set('');
    this.api.registro().subscribe({
      next: ({ eventos }) => {
        this.eventos.set(eventos);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.cargando.set(false);
      },
    });
  }
}
