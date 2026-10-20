import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { ApiService, ContratoResumen, Estado } from '../../core/api';
import { SesionService } from '../../core/sesion';
import { etiquetaEstado, fecha } from '../../core/formato';

type Filtro = 'TODOS' | Estado;

@Component({
  selector: 'app-lista-contratos',
  imports: [FormsModule, RouterLink, MatButtonToggleModule, MatFormFieldModule, MatInputModule],
  templateUrl: './lista.html',
  styleUrl: './lista.scss',
})
export class ListaContratos implements OnInit {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);

  protected readonly puedeActuar = computed(() => this.sesion.usuario()?.rol !== 'VISOR');
  protected readonly esAdmin = computed(() => this.sesion.usuario()?.rol === 'ADMIN');

  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly contratos = signal<ContratoResumen[]>([]);
  protected readonly filtro = signal<Filtro>('TODOS');
  protected busqueda = '';

  protected readonly visibles = computed(() => {
    const texto = this.busquedaActual().toLowerCase();
    return this.contratos()
      .filter((c) => this.filtro() === 'TODOS' || c.estado === this.filtro())
      .filter((c) => texto === '' || c.cliente.toLowerCase().includes(texto) || c.correo.toLowerCase().includes(texto));
  });

  private readonly busquedaActual = signal('');

  protected readonly conteos = computed(() => {
    const todos = this.contratos();
    const contar = (e: Estado) => todos.filter((c) => c.estado === e).length;
    return { BORRADOR: contar('BORRADOR'), ENVIADO: contar('ENVIADO'), FIRMADO: contar('FIRMADO') };
  });

  protected readonly etiqueta = etiquetaEstado;
  protected readonly fecha = fecha;

  ngOnInit(): void {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.error.set('');
    this.api.contratos().subscribe({
      next: ({ contratos }) => {
        this.contratos.set(contratos);
        this.cargando.set(false);
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.cargando.set(false);
      },
    });
  }

  protected alBuscar(valor: string): void {
    this.busquedaActual.set(valor);
  }
}
